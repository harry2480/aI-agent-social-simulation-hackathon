import { ExperimentConfig } from '@/backend/domain/models/experiment-config.model';
import { MAX_EVENT_DEPTH } from '@/backend/domain/models/simulation-event.model';
import { SimulationEngine } from '@/backend/domain/services/simulation-engine.service';
import { RuleBasedAiDecisionGateway } from '@/backend/infrastructure/adapters/rule-based-ai-decision.adapter';
import { describe, expect, it } from 'vitest';

function config(overrides: Partial<Parameters<typeof ExperimentConfig.create>[0]> = {}) {
	return ExperimentConfig.create({
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
		it('伝播 Depth は上限を超えない', async () => {
			const { state } = await run();
			for (const event of state.events) {
				expect(event.depth).toBeLessThanOrEqual(MAX_EVENT_DEPTH);
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
