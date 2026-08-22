import { Agent } from '@/backend/domain/models/agent.model';
import { City } from '@/backend/domain/models/city.model';
import { SimulationClock } from '@/backend/domain/models/simulation-clock.model';
import { SimulationEvent } from '@/backend/domain/models/simulation-event.model';
import { SimulationState } from '@/backend/domain/models/simulation-state.model';
import { SeededRandomService } from '@/backend/domain/services/seeded-random.service';
import {
	SLEEP_TRANSMISSION_THRESHOLD_MINUTES,
	SleepTransmissionService,
} from '@/backend/domain/services/sleep-transmission.service';
import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../../helpers/experiment-config';

const layout = {
	residentialDistricts: 1,
	officeDistricts: 1,
	commercialDistricts: 1,
	logisticsDistricts: 1,
	homesPerResidentialDistrict: 2,
	workplacesPerOfficeDistrict: 1,
	storesPerCommercialDistrict: 1,
};

/** 指定した Sleep Debt を持つ Agent だけの State。人口カウントの検証に使う */
function buildStateWithDebts(debts: readonly number[]): SimulationState {
	const config = createTestConfig({
		seed: 1,
		population: Math.max(1, debts.length),
		days: 1,
		initialSleepDeprivedRate: 0,
		cityLayout: layout,
	});
	const city = City.generate(config.cityLayout, new SeededRandomService(1));
	const agents = debts.map((debt, index) =>
		Agent.create({
			id: `agent-${index}`,
			role: 'office_worker',
			homeId: 'home-residential-0-0',
			rng: new SeededRandomService(index + 1),
			initialSleepDebtHours: debt,
			thresholds: config.sleepStateThresholds,
		}),
	);
	return new SimulationState(config, city, agents, SimulationClock.start());
}

function buildState(): SimulationState {
	const config = createTestConfig({
		seed: 1,
		population: 2,
		days: 1,
		initialSleepDeprivedRate: 0,
		cityLayout: layout,
	});
	const city = City.generate(config.cityLayout, new SeededRandomService(1));
	const agents = ['victim', 'source'].map((id, index) =>
		Agent.create({
			id,
			role: 'office_worker',
			homeId: `home-residential-0-${index}`,
			rng: new SeededRandomService(index + 1),
			thresholds: config.sleepStateThresholds,
		}),
	);
	return new SimulationState(config, city, agents, SimulationClock.start());
}

describe('SleepTransmissionService', () => {
	const service = new SleepTransmissionService();

	it('30 分未満の睡眠機会損失は伝播候補にしない', () => {
		const state = buildState();
		const loss = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick: 10,
				type: 'sleep_opportunity_loss',
				actorId: 'victim',
			}),
		);
		service.detect(state, loss, SLEEP_TRANSMISSION_THRESHOLD_MINUTES - 1);
		expect(state.transmissions).toHaveLength(0);
	});

	it('因果チェーンを遡って他 Agent が見つかれば伝播候補として記録する', () => {
		const state = buildState();
		const jam = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick: 1,
				type: 'traffic_jam',
				actorId: 'source',
			}),
		);
		const delay = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick: 2,
				type: 'commute_delay',
				actorId: 'victim',
				causes: [jam],
			}),
		);
		const loss = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick: 3,
				type: 'sleep_opportunity_loss',
				actorId: 'victim',
				causes: [delay],
			}),
		);

		service.detect(state, loss, 60);

		expect(state.transmissions).toHaveLength(1);
		expect(state.transmissions[0]?.fromAgentId).toBe('source');
		expect(state.transmissions[0]?.toAgentId).toBe('victim');
		// この時点ではまだ Sleep Debt が確定していないため新規ケース扱いにしない
		expect(state.transmissions[0]?.becameNewCase).toBe(false);
	});

	it('時間的に直前でも因果チェーンに無い Event は伝播元にしない', () => {
		const state = buildState();
		// source の Event は存在するが、victim の損失はそれを参照していない
		state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick: 2,
				type: 'accident',
				actorId: 'source',
			}),
		);
		const loss = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick: 3,
				type: 'sleep_opportunity_loss',
				actorId: 'victim',
			}),
		);

		service.detect(state, loss, 90);

		expect(state.transmissions).toHaveLength(0);
	});

	it('自分自身が原因の損失は伝播として扱わない', () => {
		const state = buildState();
		const overtime = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick: 1,
				type: 'overtime',
				actorId: 'victim',
			}),
		);
		const loss = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick: 2,
				type: 'sleep_opportunity_loss',
				actorId: 'victim',
				causes: [overtime],
			}),
		);

		service.detect(state, loss, 90);

		expect(state.transmissions).toHaveLength(0);
	});

	describe('commitNightTransition', () => {
		it('Sleep Debt 確定後に遷移したら直近の伝播候補を新規ケースへ確定する', () => {
			const state = buildState();
			const jam = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick: 1,
					type: 'traffic_jam',
					actorId: 'source',
				}),
			);
			const loss = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick: 2,
					type: 'sleep_opportunity_loss',
					actorId: 'victim',
					causes: [jam],
				}),
			);
			service.detect(state, loss, 60);

			state.agent('victim').addSleepDebtHours(3);
			expect(service.commitNightTransition(state, 'victim')).toBe(true);

			expect(state.transmissions[0]?.becameNewCase).toBe(true);
			// 伝播元がケースでないため、受け手は他ケース由来ではなく起点として扱う
			expect(state.generations.get('source')).toBeUndefined();
			expect(state.generations.get('victim')).toBe(0);
		});

		it('伝播元がケースなら受け手の Generation は伝播元 + 1 になる', () => {
			const state = buildState();
			state.generations.set('source', 1);
			const jam = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick: 1,
					type: 'traffic_jam',
					actorId: 'source',
				}),
			);
			const loss = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick: 2,
					type: 'sleep_opportunity_loss',
					actorId: 'victim',
					causes: [jam],
				}),
			);
			service.detect(state, loss, 60);
			state.agent('victim').addSleepDebtHours(3);
			service.commitNightTransition(state, 'victim');

			expect(state.generations.get('victim')).toBe(2);
		});

		it('伝播候補が無い場合は自然発生ケースとして Generation 0 に置く', () => {
			const state = buildState();
			state.agent('victim').addSleepDebtHours(3);
			expect(service.commitNightTransition(state, 'victim')).toBe(true);
			expect(state.generations.get('victim')).toBe(0);
		});

		it('状態が変わらなければ false を返し伝播候補も確定しない', () => {
			const state = buildState();
			expect(service.commitNightTransition(state, 'victim')).toBe(false);
		});

		it('既に世代が確定している Agent の世代は上書きしない', () => {
			const state = buildState();
			state.generations.set('victim', 5);
			state.agent('victim').addSleepDebtHours(3);
			service.commitNightTransition(state, 'victim');
			expect(state.generations.get('victim')).toBe(5);
		});
	});

	describe('因果チェーンの探索', () => {
		it('actor が居ない Event からは伝播元を辿らない', () => {
			// 遡れば伝播元は見つかるが、受け手が特定できない。
			// ここで弾かないと toAgentId が undefined の伝播が積まれる
			const state = buildState();
			const origin = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick: 1,
					type: 'accident',
					actorId: 'source',
				}),
			);
			const loss = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick: 3,
					type: 'sleep_opportunity_loss',
					causes: [origin],
				}),
			);

			service.detect(state, loss, 90);

			expect(state.transmissions).toHaveLength(0);
		});

		it('同じ Event へ 2 経路で到達しても二重に辿らず伝播元は 1 人に決まる', () => {
			// 遅延が合流する形は実際に起きる。visited が無いと同じ枝を何度も展開する
			const state = buildState();
			const origin = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick: 1,
					type: 'accident',
					actorId: 'source',
				}),
			);
			const shared = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick: 2,
					type: 'commute_delay',
					actorId: 'victim',
					causes: [origin],
				}),
			);
			const pathA = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick: 3,
					type: 'late_arrival',
					actorId: 'victim',
					causes: [shared],
				}),
			);
			const pathB = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick: 3,
					type: 'work_delay',
					actorId: 'victim',
					causes: [shared],
				}),
			);
			const loss = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick: 4,
					type: 'sleep_opportunity_loss',
					actorId: 'victim',
					causes: [pathA, pathB],
				}),
			);

			service.detect(state, loss, 90);

			expect(state.transmissions).toHaveLength(1);
			expect(state.transmissions[0]?.fromAgentId).toBe('source');
		});

		it('因果が循環していても探索が止まる', () => {
			// visited が無いと同じ枝を無限に展開して Tick が返ってこなくなる。
			// 循環そのものは想定外だが、1 本の壊れたデータで Run 全体が止まるのは避ける
			const state = buildState();
			const first = state.recordEvent(
				SimulationEvent.reconstruct({
					id: 'cycle-a',
					tick: 1,
					type: 'work_delay',
					actorId: 'victim',
					targetIds: [],
					causedByEventIds: ['cycle-b'],
					impact: {},
					depth: 1,
				}),
			);
			state.recordEvent(
				SimulationEvent.reconstruct({
					id: 'cycle-b',
					tick: 1,
					type: 'work_delay',
					actorId: 'victim',
					targetIds: [],
					causedByEventIds: ['cycle-a'],
					impact: {},
					depth: 1,
				}),
			);
			const loss = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick: 2,
					type: 'sleep_opportunity_loss',
					actorId: 'victim',
					causes: [first],
				}),
			);

			service.detect(state, loss, 90);

			expect(state.transmissions).toHaveLength(0);
		});

		it('記録されていない Event を参照していても探索を止めない', () => {
			// 参照先が引けない枝を打ち切り扱いにすると、辿れるはずの伝播元を見失う
			const state = buildState();
			const origin = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick: 1,
					type: 'accident',
					actorId: 'source',
				}),
			);
			const loss = state.recordEvent(
				SimulationEvent.reconstruct({
					id: state.nextEventId(),
					tick: 2,
					type: 'sleep_opportunity_loss',
					actorId: 'victim',
					targetIds: [],
					causedByEventIds: ['missing-event', origin.id],
					impact: {},
					depth: 1,
				}),
			);

			service.detect(state, loss, 90);

			expect(state.transmissions).toHaveLength(1);
			expect(state.transmissions[0]?.fromAgentId).toBe('source');
		});

		it('参照先がすべて引けない場合は伝播候補にしない', () => {
			const state = buildState();
			const loss = state.recordEvent(
				SimulationEvent.reconstruct({
					id: state.nextEventId(),
					tick: 2,
					type: 'sleep_opportunity_loss',
					actorId: 'victim',
					targetIds: [],
					causedByEventIds: ['missing-event'],
					impact: {},
					depth: 1,
				}),
			);

			service.detect(state, loss, 90);

			expect(state.transmissions).toHaveLength(0);
		});
	});

	describe('deprivedPopulation', () => {
		it('Sleep Deprived 以上の Agent だけを数える', () => {
			// 既定閾値は tired 1h / sleepDeprived 2h / severe 5h。
			// tired は「睡眠不足ケース」ではないため数に入れない
			const state = buildStateWithDebts([0, 1, 2, 6]);

			expect(service.deprivedPopulation(state)).toBe(2);
		});

		it('閾値ちょうどは睡眠不足として数える', () => {
			expect(service.deprivedPopulation(buildStateWithDebts([1.99]))).toBe(0);
			expect(service.deprivedPopulation(buildStateWithDebts([2]))).toBe(1);
		});

		it('該当者が居なければ 0', () => {
			expect(service.deprivedPopulation(buildStateWithDebts([0, 0]))).toBe(0);
		});

		it('全員が該当すれば人口と一致する', () => {
			expect(service.deprivedPopulation(buildStateWithDebts([3, 4, 9]))).toBe(3);
		});
	});
});
