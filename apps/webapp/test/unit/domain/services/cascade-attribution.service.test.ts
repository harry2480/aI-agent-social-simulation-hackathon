import { City } from '@/backend/domain/models/city.model';
import { SimulationClock } from '@/backend/domain/models/simulation-clock.model';
import {
	SimulationEvent,
	networkOfEventType,
} from '@/backend/domain/models/simulation-event.model';
import { SimulationState } from '@/backend/domain/models/simulation-state.model';
import { CascadeService } from '@/backend/domain/services/cascade.service';
import { ReproductionNumberService } from '@/backend/domain/services/reproduction-number.service';
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

function addTransmission(
	state: SimulationState,
	from: string,
	to: string,
	becameNewCase: boolean,
	causeEventId = 'e1',
): void {
	state.transmissions.push({
		fromAgentId: from,
		toAgentId: to,
		tick: 0,
		sleepLossMinutes: 60,
		causeEventId,
		becameNewCase,
	});
}

const service = new CascadeService(new ReproductionNumberService());

describe('networkOfEventType', () => {
	it.each([
		['accident', 'transportation'],
		['traffic_jam', 'transportation'],
		['commute_delay', 'transportation'],
		['late_arrival', 'transportation'],
		['work_failure', 'work'],
		['overtime', 'work'],
		['household_delay', 'household'],
	] as const)('%s は %s Network', (type, network) => {
		expect(networkOfEventType(type)).toBe(network);
	});

	it('どの Network にも属さない Event は undefined', () => {
		expect(networkOfEventType('decision')).toBeUndefined();
		expect(networkOfEventType('sleep_loss')).toBeUndefined();
	});
});

describe('CascadeService.reachFrom', () => {
	it('起点から連鎖で新規ケースになった Agent 数を数える', () => {
		const state = buildState();
		addTransmission(state, 'a', 'b', true);
		addTransmission(state, 'b', 'c', true);
		addTransmission(state, 'c', 'd', true);

		expect(service.reachFrom(state, 'a')).toBe(3);
		expect(service.reachFrom(state, 'b')).toBe(2);
		expect(service.reachFrom(state, 'd')).toBe(0);
	});

	it('新規ケースになっていない伝播は数えない', () => {
		const state = buildState();
		addTransmission(state, 'a', 'b', false);
		expect(service.reachFrom(state, 'a')).toBe(0);
	});

	it('起点と無関係な伝播は数えない（背景の自然発生を混ぜない）', () => {
		const state = buildState();
		addTransmission(state, 'a', 'b', true);
		addTransmission(state, 'x', 'y', true);

		expect(service.reachFrom(state, 'a')).toBe(1);
	});

	it('同じ Agent を重複して数えない', () => {
		const state = buildState();
		addTransmission(state, 'a', 'b', true);
		addTransmission(state, 'a', 'b', true);

		expect(service.reachFrom(state, 'a')).toBe(1);
	});

	it('循環があっても停止する', () => {
		const state = buildState();
		addTransmission(state, 'a', 'b', true);
		addTransmission(state, 'b', 'a', true);

		expect(service.reachFrom(state, 'a')).toBe(1);
	});
});

describe('CascadeService.transmissionCountFrom', () => {
	it('新規ケースかどうかに関わらず伝播回数を数える', () => {
		const state = buildState();
		addTransmission(state, 'a', 'b', false);
		addTransmission(state, 'a', 'c', true);
		addTransmission(state, 'x', 'd', true);

		expect(service.transmissionCountFrom(state, 'a')).toBe(2);
	});
});

describe('CascadeService.networksTraversedFrom', () => {
	it('伝播の因果チェーンが通過した Network を集める', () => {
		const state = buildState();
		const accident = state.recordEvent(
			SimulationEvent.create({ id: state.nextEventId(), tick: 1, type: 'accident', actorId: 'a' }),
		);
		const overtime = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick: 2,
				type: 'overtime',
				actorId: 'b',
				causes: [accident],
			}),
		);
		const loss = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick: 3,
				type: 'sleep_opportunity_loss',
				actorId: 'b',
				causes: [overtime],
			}),
		);
		addTransmission(state, 'a', 'b', false, loss.id);

		expect(service.networksTraversedFrom(state, 'a')).toEqual(['transportation', 'work']);
	});

	it('新規ケースでない伝播も対象にする', () => {
		const state = buildState();
		const jam = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick: 1,
				type: 'traffic_jam',
				actorId: 'a',
			}),
		);
		const loss = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick: 2,
				type: 'sleep_opportunity_loss',
				actorId: 'b',
				causes: [jam],
			}),
		);
		addTransmission(state, 'a', 'b', false, loss.id);

		expect(service.networksTraversedFrom(state, 'a')).toEqual(['transportation']);
	});

	it('伝播が無ければ空配列', () => {
		expect(service.networksTraversedFrom(buildState(), 'a')).toEqual([]);
	});
});
