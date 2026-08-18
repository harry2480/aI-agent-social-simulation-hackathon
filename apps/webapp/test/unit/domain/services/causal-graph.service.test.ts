import { City } from '@/backend/domain/models/city.model';
import { SimulationClock } from '@/backend/domain/models/simulation-clock.model';
import { SimulationEvent } from '@/backend/domain/models/simulation-event.model';
import { SimulationState } from '@/backend/domain/models/simulation-state.model';
import { CausalGraphService } from '@/backend/domain/services/causal-graph.service';
import { SeededRandomService } from '@/backend/domain/services/seeded-random.service';
import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../../helpers/experiment-config';

function buildState(): SimulationState {
	const config = createTestConfig({
		seed: 1,
		population: 10,
		days: 1,
		initialSleepDeprivedRate: 0,
		cityLayout: {
			residentialDistricts: 1,
			officeDistricts: 1,
			commercialDistricts: 1,
			logisticsDistricts: 1,
			homesPerResidentialDistrict: 1,
			workplacesPerOfficeDistrict: 1,
			storesPerCommercialDistrict: 1,
		},
	});
	const city = City.generate(config.cityLayout, new SeededRandomService(1));
	return new SimulationState(config, city, [], SimulationClock.start());
}

/**
 * 要件定義 21 章の連鎖を作る:
 * accident(driver) → traffic_jam(driver) → commute_delay(worker)
 * → late_arrival(worker) → overtime(worker) → sleep_opportunity_loss(worker)
 */
function buildChain(state: SimulationState) {
	const accident = state.recordEvent(
		SimulationEvent.create({
			id: state.nextEventId(),
			tick: 1,
			type: 'accident',
			actorId: 'driver',
		}),
	);
	const jam = state.recordEvent(
		SimulationEvent.create({
			id: state.nextEventId(),
			tick: 2,
			type: 'traffic_jam',
			actorId: 'driver',
			causes: [accident],
		}),
	);
	const commuteDelay = state.recordEvent(
		SimulationEvent.create({
			id: state.nextEventId(),
			tick: 3,
			type: 'commute_delay',
			actorId: 'worker',
			causes: [jam],
			impact: { delayMinutes: 25 },
		}),
	);
	const lateArrival = state.recordEvent(
		SimulationEvent.create({
			id: state.nextEventId(),
			tick: 4,
			type: 'late_arrival',
			actorId: 'worker',
			causes: [commuteDelay],
		}),
	);
	const overtime = state.recordEvent(
		SimulationEvent.create({
			id: state.nextEventId(),
			tick: 5,
			type: 'overtime',
			actorId: 'worker',
			causes: [lateArrival],
		}),
	);
	const loss = state.recordEvent(
		SimulationEvent.create({
			id: state.nextEventId(),
			tick: 6,
			type: 'sleep_opportunity_loss',
			actorId: 'worker',
			causes: [overtime],
			impact: { sleepLossMinutes: 45 },
		}),
	);
	return { accident, jam, commuteDelay, lateArrival, overtime, loss };
}

describe('CausalGraphService', () => {
	const service = new CausalGraphService();

	describe('buildSubgraph', () => {
		it('起点から祖先方向を全て辿る', () => {
			const state = buildState();
			const { accident, loss } = buildChain(state);

			const graph = service.buildSubgraph(state, loss.id);

			expect(graph.nodes.map((node) => node.eventId)).toContain(accident.id);
			expect(graph.nodes).toHaveLength(6);
			expect(graph.truncated).toBe(false);
		});

		it('起点から子孫方向も辿る', () => {
			const state = buildState();
			const { accident, loss } = buildChain(state);

			const graph = service.buildSubgraph(state, accident.id);

			expect(graph.nodes.map((node) => node.eventId)).toContain(loss.id);
		});

		it('起点の距離は 0、祖先は負、子孫は正になる', () => {
			const state = buildState();
			const { accident, jam, commuteDelay } = buildChain(state);

			const graph = service.buildSubgraph(state, jam.id);
			const distance = (id: string) =>
				graph.nodes.find((node) => node.eventId === id)?.distanceFromFocus;

			expect(distance(jam.id)).toBe(0);
			expect(distance(accident.id)).toBe(-1);
			expect(distance(commuteDelay.id)).toBe(1);
		});

		it('エッジは部分グラフに含まれる Event 同士だけを繋ぐ', () => {
			const state = buildState();
			const { loss } = buildChain(state);

			const graph = service.buildSubgraph(state, loss.id);
			const included = new Set(graph.nodes.map((node) => node.eventId));

			for (const edge of graph.edges) {
				expect(included.has(edge.fromEventId)).toBe(true);
				expect(included.has(edge.toEventId)).toBe(true);
			}
		});

		it('因果で繋がっていない Event は含めない', () => {
			const state = buildState();
			const { loss } = buildChain(state);
			const unrelated = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick: 6,
					type: 'accident',
					actorId: 'other',
				}),
			);

			const graph = service.buildSubgraph(state, loss.id);

			expect(graph.nodes.map((node) => node.eventId)).not.toContain(unrelated.id);
		});

		it('ノード上限を超えると打ち切って truncated を立てる', () => {
			const state = buildState();
			const { loss } = buildChain(state);

			const graph = service.buildSubgraph(state, loss.id, { maxNodes: 3 });

			expect(graph.nodes.length).toBeLessThanOrEqual(3);
			expect(graph.truncated).toBe(true);
		});

		it('存在しない Event を起点にすると空グラフを返す', () => {
			const graph = service.buildSubgraph(buildState(), 'unknown');
			expect(graph.nodes).toHaveLength(0);
			expect(graph.edges).toHaveLength(0);
		});

		it('ノードは Tick 昇順に並ぶ', () => {
			const state = buildState();
			const { loss } = buildChain(state);

			const ticks = service.buildSubgraph(state, loss.id).nodes.map((node) => node.tick);

			expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
		});
	});

	describe('findFocusEventForAgent', () => {
		it('睡眠不足へ至った Event を優先して起点にする', () => {
			const state = buildState();
			const { loss } = buildChain(state);
			const deprived = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick: 7,
					type: 'sleep_deprived',
					actorId: 'worker',
					causes: [loss],
				}),
			);

			expect(service.findFocusEventForAgent(state, 'worker')?.id).toBe(deprived.id);
		});

		it('睡眠不足に至っていなければ直近の睡眠損失 Event を起点にする', () => {
			const state = buildState();
			const { loss } = buildChain(state);

			expect(service.findFocusEventForAgent(state, 'worker')?.id).toBe(loss.id);
		});

		it('該当 Event が無ければ undefined を返す', () => {
			const state = buildState();
			buildChain(state);

			expect(service.findFocusEventForAgent(state, 'nobody')).toBeUndefined();
		});
	});
});
