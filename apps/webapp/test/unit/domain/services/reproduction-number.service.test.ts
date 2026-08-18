import { City } from '@/backend/domain/models/city.model';
import { ExperimentConfig } from '@/backend/domain/models/experiment-config.model';
import { SimulationClock } from '@/backend/domain/models/simulation-clock.model';
import { SimulationState } from '@/backend/domain/models/simulation-state.model';
import { CascadeService } from '@/backend/domain/services/cascade.service';
import { ReproductionNumberService } from '@/backend/domain/services/reproduction-number.service';
import { SeededRandomService } from '@/backend/domain/services/seeded-random.service';
import { describe, expect, it } from 'vitest';

function buildState(population: number): SimulationState {
	const config = ExperimentConfig.create({
		seed: 1,
		population,
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
): void {
	state.transmissions.push({
		fromAgentId: from,
		toAgentId: to,
		tick: 0,
		sleepLossMinutes: 60,
		causeEventId: 'e1',
		becameNewCase,
	});
}

describe('ReproductionNumberService', () => {
	const service = new ReproductionNumberService();

	it('Individual Rs は新規ケースになった伝播のみ数える', () => {
		const state = buildState(10);
		addTransmission(state, 'a', 'b', true);
		addTransmission(state, 'a', 'c', true);
		addTransmission(state, 'a', 'd', false);
		expect(service.individualRs(state, 'a')).toBe(2);
	});

	it('Generation Rs は次世代の新規ケース数 / その世代の Agent 数', () => {
		const state = buildState(10);
		state.generations.set('a', 0);
		state.generations.set('b', 0);
		state.generations.set('c', 1);
		state.generations.set('d', 1);
		state.generations.set('e', 1);
		addTransmission(state, 'a', 'c', true);
		addTransmission(state, 'a', 'd', true);
		addTransmission(state, 'b', 'e', true);
		expect(service.generationRs(state, 0)).toBe(1.5);
	});

	it('該当世代に Agent がいなければ 0 を返す', () => {
		const state = buildState(10);
		expect(service.generationRs(state, 3)).toBe(0);
	});

	it('世代が空でも latestGeneration は 0', () => {
		expect(service.latestGeneration(buildState(10))).toBe(0);
	});
});

describe('CascadeService', () => {
	const reproductionNumberService = new ReproductionNumberService();
	const service = new CascadeService(reproductionNumberService);

	it('Rs > 1 が 1 Generation だけでは Cascade と判定しない', () => {
		const state = buildState(10);
		state.generations.set('a', 0);
		for (const id of ['b', 'c', 'd']) {
			state.generations.set(id, 1);
			addTransmission(state, 'a', id, true);
		}
		expect(reproductionNumberService.generationRs(state, 0)).toBe(3);
		expect(service.evaluate(state).occurred).toBe(false);
	});

	it('Rs > 1 が 2 Generation 継続し Reach が 10% 以上なら Cascade と判定する', () => {
		const state = buildState(10);
		state.generations.set('g0', 0);
		for (const id of ['g1a', 'g1b']) {
			state.generations.set(id, 1);
			addTransmission(state, 'g0', id, true);
		}
		for (const id of ['g2a', 'g2b', 'g2c', 'g2d', 'g2e']) {
			state.generations.set(id, 2);
			addTransmission(state, 'g1a', id, true);
		}
		expect(reproductionNumberService.generationRs(state, 0)).toBe(2);
		expect(reproductionNumberService.generationRs(state, 1)).toBe(2.5);
		expect(service.evaluate(state).occurred).toBe(true);
	});

	it('Reach が Population の 10% 未満なら Cascade と判定しない', () => {
		const state = buildState(500);
		state.generations.set('g0', 0);
		for (const id of ['g1a', 'g1b']) {
			state.generations.set(id, 1);
			addTransmission(state, 'g0', id, true);
		}
		for (const id of ['g2a', 'g2b', 'g2c']) {
			state.generations.set(id, 2);
			addTransmission(state, 'g1a', id, true);
		}
		expect(service.evaluate(state).occurred).toBe(false);
	});

	it('Cascade Reach は新規ケースになった Agent の重複を除いた数', () => {
		const state = buildState(10);
		addTransmission(state, 'a', 'b', true);
		addTransmission(state, 'c', 'b', true);
		addTransmission(state, 'a', 'd', false);
		expect(service.cascadeReach(state)).toBe(1);
	});
});
