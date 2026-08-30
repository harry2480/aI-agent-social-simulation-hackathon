import { MAX_EVENT_DEPTH } from '@/backend/domain/models/simulation-event.model';
import { SimulationEngine } from '@/backend/domain/services/simulation-engine.service';
import { RuleBasedAiDecisionGateway } from '@/backend/infrastructure/adapters/rule-based-ai-decision.adapter';
import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../../helpers/experiment-config';

function config(overrides: Partial<Parameters<typeof createTestConfig>[0]> = {}) {
	return createTestConfig({
		seed: 42,
		population: 60,
		days: 3,
		initialSleepDeprivedRate: 0.2,
		shockTarget: 'driver',
		...overrides,
	});
}

async function run(overrides: Parameters<typeof config>[0] = {}) {
	const engine = SimulationEngine.create(config(overrides), new RuleBasedAiDecisionGateway());
	const state = engine.initialize();
	const summary = await engine.run(state);
	return { state, summary };
}

describe('SimulationEngine', () => {
	describe('再現性', () => {
		it('同一 Seed・同一 Config なら KPI が一致する', async () => {
			const first = await run();
			const second = await run();
			expect(second.summary).toEqual(first.summary);
		});

		it('同一 Seed・同一 Config なら Event 列が一致する', async () => {
			const first = await run();
			const second = await run();
			expect(
				second.state.events.map((event) => `${event.tick}:${event.type}:${event.actorId}`),
			).toEqual(first.state.events.map((event) => `${event.tick}:${event.type}:${event.actorId}`));
		});

		it('Seed が異なれば結果が変わる', async () => {
			const first = await run();
			const second = await run({ seed: 4242 });
			expect(second.summary).not.toEqual(first.summary);
		});
	});

	describe('初期状態', () => {
		it('Population 分の Agent を生成する', () => {
			const engine = SimulationEngine.create(config(), new RuleBasedAiDecisionGateway());
			const state = engine.initialize();
			expect(state.agents.size).toBe(60);
		});

		it('Shock 対象の Agent へ初期 Sleep Debt を与え Generation 0 に置く', () => {
			const engine = SimulationEngine.create(config(), new RuleBasedAiDecisionGateway());
			const state = engine.initialize();
			const shocked = [...state.generations.keys()];
			expect(shocked.length).toBeGreaterThan(0);
			for (const agentId of shocked) {
				const agent = state.agent(agentId);
				expect(agent.sleepDebtHours).toBeGreaterThan(0);
				expect(['driver', 'delivery_worker']).toContain(agent.role);
				expect(state.generations.get(agentId)).toBe(0);
			}
		});

		it('Shock なしなら初期 Sleep Debt を持つ Agent はいない', () => {
			const engine = SimulationEngine.create(
				config({ shockTarget: 'none', initialSleepDeprivedRate: 0 }),
				new RuleBasedAiDecisionGateway(),
			);
			const state = engine.initialize();
			for (const agent of state.agents.values()) {
				expect(agent.sleepDebtHours).toBe(0);
			}
		});
	});

	describe('Event の健全性', () => {
		it('同一 Tick 内の連鎖は伝播 Depth 上限を超えない', async () => {
			const { state } = await run({ population: 300, days: 7 });

			// 同一 Tick 内の原因のみを辿った連鎖長を測る。
			// 日をまたいで積み上がるチェーン全体の長さは制限対象ではない
			const sameTickDepth = new Map<string, number>();
			for (const event of state.events) {
				const parentDepths = event.causedByEventIds
					.map((causeId) => state.eventById(causeId))
					.filter((cause) => cause !== undefined && cause.tick === event.tick)
					.map((cause) => sameTickDepth.get(cause?.id ?? '') ?? 0);
				sameTickDepth.set(event.id, parentDepths.length === 0 ? 0 : Math.max(...parentDepths) + 1);
			}

			for (const depth of sameTickDepth.values()) {
				expect(depth).toBeLessThanOrEqual(MAX_EVENT_DEPTH);
			}
		});

		it('Causal Edge は実在する Event 同士のみを繋ぐ', async () => {
			const { state } = await run();
			for (const edge of state.causalEdges) {
				expect(state.eventById(edge.fromEventId)).toBeDefined();
				expect(state.eventById(edge.toEventId)).toBeDefined();
			}
		});

		it('Causal Edge の数は Event が参照した原因の総数と一致する', async () => {
			const { state } = await run();
			const totalCauses = state.events.reduce(
				(sum, event) => sum + event.causedByEventIds.length,
				0,
			);
			expect(state.causalEdges).toHaveLength(totalCauses);
		});
	});

	describe('KPI の妥当性', () => {
		it('Rs / Reach / Sleep Debt が負や NaN にならない', async () => {
			const { summary } = await run();
			for (const value of [
				summary.currentRs,
				summary.peakRs,
				summary.averageRs,
				summary.cascadeReach,
				summary.totalSleepDebtHours,
				summary.totalSleepLossMinutes,
				summary.accidentCount,
			]) {
				expect(Number.isNaN(value)).toBe(false);
				expect(value).toBeGreaterThanOrEqual(0);
			}
		});

		it('Tick 断面の Peak / Average Rs は Run サマリと一致する', async () => {
			// Watch Mode の KPI パネルは断面を読むため、定義がずれるとサマリと違う値が出る
			const engine = SimulationEngine.create(config(), new RuleBasedAiDecisionGateway());
			const state = engine.initialize();
			const summary = await engine.run(state);
			const latest = engine.snapshot(state);

			expect(latest.peakRs).toBe(summary.peakRs);
			expect(latest.averageRs).toBe(summary.averageRs);
			expect(latest.peakRs).toBeGreaterThanOrEqual(latest.averageRs);
		});

		it('Agent 属性は範囲内に収まる', async () => {
			const { state } = await run();
			for (const agent of state.agents.values()) {
				expect(agent.fatigue).toBeGreaterThanOrEqual(0);
				expect(agent.fatigue).toBeLessThanOrEqual(100);
				expect(agent.stress).toBeGreaterThanOrEqual(0);
				expect(agent.stress).toBeLessThanOrEqual(100);
				expect(agent.sleepDebtHours).toBeGreaterThanOrEqual(0);
			}
		});
	});

	describe('Sleep Cascade の成立', () => {
		it('Driver Shock は複数 Agent へ伝播し Generation が 1 以上へ進む', async () => {
			const { state } = await run({ population: 300, days: 7, initialSleepDeprivedRate: 0.2 });
			const newCases = state.transmissions.filter((t) => t.becameNewCase);
			expect(newCases.length).toBeGreaterThan(0);
			expect(Math.max(...state.generations.values())).toBeGreaterThanOrEqual(1);
		});

		it('Baseline より Driver Shock の方が Cascade Reach が大きい', async () => {
			const baseline = await run({
				population: 300,
				days: 7,
				shockTarget: 'none',
				initialSleepDeprivedRate: 0,
			});
			const shocked = await run({
				population: 300,
				days: 7,
				shockTarget: 'driver',
				initialSleepDeprivedRate: 0.2,
			});
			expect(shocked.summary.cascadeReach).toBeGreaterThan(baseline.summary.cascadeReach);
		});

		it('Driver Shock は同率の Random Shock より Cascade Reach が大きい', async () => {
			const random = await run({
				population: 300,
				days: 7,
				shockTarget: 'random',
				initialSleepDeprivedRate: 0.2,
			});
			const driver = await run({
				population: 300,
				days: 7,
				shockTarget: 'driver',
				initialSleepDeprivedRate: 0.2,
			});
			expect(driver.summary.cascadeReach).toBeGreaterThan(random.summary.cascadeReach);
		});

		it('初期睡眠不足率が高いほど Cascade Reach が大きくなる', async () => {
			const low = await run({ population: 300, days: 7, initialSleepDeprivedRate: 0.05 });
			const high = await run({ population: 300, days: 7, initialSleepDeprivedRate: 0.2 });
			expect(high.summary.cascadeReach).toBeGreaterThan(low.summary.cascadeReach);
		});
	});

	describe('Logistics 連鎖', () => {
		/** 遅配が起きる規模。Delivery Worker が数人しかいない小規模では連鎖が観測できない */
		const logisticsConfig = {
			population: 150,
			days: 4,
			initialSleepDeprivedRate: 0.3,
			shockTarget: 'driver' as const,
			trafficLevel: 1.5,
		};

		it('遅れた配送は Store Worker の業務遅延として伝播する', async () => {
			const { state } = await run(logisticsConfig);

			const deliveryDelays = state.events.filter((event) => event.type === 'delivery_delay');
			const storeDelays = state.events.filter((event) => event.type === 'store_delay');

			expect(deliveryDelays.length).toBeGreaterThan(0);
			expect(storeDelays.length).toBeGreaterThan(0);
			// Store の遅延は必ず遅配を原因に持つ（時間的に近いだけの Event を原因にしない）
			const deliveryIds = new Set(deliveryDelays.map((event) => event.id));
			expect(
				storeDelays.every((event) => event.causedByEventIds.some((id) => deliveryIds.has(id))),
			).toBe(true);
		});

		it('遅配は Store Worker 本人ではなく配送側を Actor として記録する', async () => {
			const { state } = await run(logisticsConfig);

			const deliveryDelays = state.events.filter((event) => event.type === 'delivery_delay');
			for (const event of deliveryDelays) {
				const actor = event.actorId === undefined ? undefined : state.agents.get(event.actorId);
				expect(actor?.role).toBe('delivery_worker');
				expect(event.targetIds.length).toBe(1);
			}
		});

		it('Store Worker の遅延は配送先の店舗で働く Agent にだけ及ぶ', async () => {
			const { state } = await run(logisticsConfig);

			const storeDelays = state.events.filter((event) => event.type === 'store_delay');
			for (const event of storeDelays) {
				const actor = event.actorId === undefined ? undefined : state.agents.get(event.actorId);
				expect(actor?.role).toBe('store_worker');
			}
		});

		it('同じ店舗の同日の遅配は、いちばん遅れた配送の分だけ反映する', async () => {
			const { state } = await run(logisticsConfig);

			const storeDelays = state.events.filter((event) => event.type === 'store_delay');
			const byStoreAndDay = new Map<string, number>();
			for (const event of storeDelays) {
				const key = `${event.actorId}:${Math.floor(event.tick / 96)}`;
				byStoreAndDay.set(key, (byStoreAndDay.get(key) ?? 0) + (event.impact.delayMinutes ?? 0));
			}

			// 1 日に複数の遅配が届いても、累積は 1 回あたりの上限（60 分）を超えない
			for (const total of byStoreAndDay.values()) {
				expect(total).toBeLessThanOrEqual(60);
			}
		});

		it('店舗遅延は Store Worker への Sleep Transmission として記録される', async () => {
			const withLogistics = await run(logisticsConfig);
			const storeDelays = withLogistics.state.events.filter(
				(event) => event.type === 'store_delay',
			);

			// 店舗遅延を経由した睡眠機会損失が Transmission として記録されていること
			const storeDelayActorIds = new Set(storeDelays.map((event) => event.actorId));
			const transmissionsToStoreWorkers = withLogistics.state.transmissions.filter((transmission) =>
				storeDelayActorIds.has(transmission.toAgentId),
			);
			expect(transmissionsToStoreWorkers.length).toBeGreaterThan(0);
		});
	});

	describe('Intervention', () => {
		it('Remote Work は通勤遅延を減らす', async () => {
			const none = await run({ population: 300, days: 7 });
			const remote = await run({ population: 300, days: 7, intervention: 'remote_work' });
			expect(remote.summary.averageCommuteDelayMinutes).toBeLessThanOrEqual(
				none.summary.averageCommuteDelayMinutes,
			);
		});

		it('Overtime Limit は残業時間を増やさない', async () => {
			const none = await run({ population: 300, days: 7 });
			const limited = await run({ population: 300, days: 7, intervention: 'overtime_limit' });
			expect(limited.summary.overtimeHours).toBeLessThanOrEqual(none.summary.overtimeHours);
		});
	});
});
