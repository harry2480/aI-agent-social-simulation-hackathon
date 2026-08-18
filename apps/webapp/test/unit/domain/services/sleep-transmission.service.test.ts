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
});
