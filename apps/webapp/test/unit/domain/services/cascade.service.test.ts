import { City } from '@/backend/domain/models/city.model';
import { SimulationClock } from '@/backend/domain/models/simulation-clock.model';
import { SimulationState } from '@/backend/domain/models/simulation-state.model';
import { CascadeService } from '@/backend/domain/services/cascade.service';
import { ReproductionNumberService } from '@/backend/domain/services/reproduction-number.service';
import { SeededRandomService } from '@/backend/domain/services/seeded-random.service';
import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../../helpers/experiment-config';

/** population 10・既定閾値（Rs > 1 が 2 世代 / Reach 10%）の State */
function buildState(): SimulationState {
	const config = createTestConfig({
		seed: 1,
		population: 10,
		days: 1,
		initialSleepDeprivedRate: 0,
	});
	const city = City.generate(config.cityLayout, new SeededRandomService(1));
	return new SimulationState(config, city, [], SimulationClock.start());
}

/** from が to を新規ケース化した伝播を積む。generation は Rs 算出に必要 */
function transmit(state: SimulationState, from: string, to: string, generation: number): void {
	state.generations.set(from, generation);
	state.generations.set(to, generation + 1);
	state.transmissions.push({
		fromAgentId: from,
		toAgentId: to,
		tick: 0,
		sleepLossMinutes: 60,
		causeEventId: 'e1',
		becameNewCase: true,
	});
}

const service = new CascadeService(new ReproductionNumberService());

describe('CascadeService.evaluate', () => {
	it('Rs > 1 が 1 世代で途切れると Cascade は成立しないが Outbreak は成立する', () => {
		const state = buildState();
		// Generation 0 の 1 人が 2 人を新規ケース化（Rs = 2）、次世代は誰も広げない
		transmit(state, 'a', 'b', 0);
		transmit(state, 'a', 'c', 0);

		const status = service.evaluate(state);

		expect(status.occurred).toBe(false);
		expect(status.outbreakOccurred).toBe(true);
		expect(status.reach).toBe(2);
	});

	it('判定条件を渡すと、同じ Run をその条件で数え直す', () => {
		// Run を回し直さずに「どの判定なら Cascade と呼べるか」を測るため（要件定義 24 章）
		const state = buildState();
		transmit(state, 'a', 'b', 0);
		transmit(state, 'a', 'c', 0);

		expect(service.evaluate(state).occurred).toBe(false);
		expect(
			service.evaluate(state, { rsThreshold: 1, minGenerations: 1, minReachRate: 0.1 }).occurred,
		).toBe(true);
		// Reach の条件を満たさなければ、世代の条件を緩めても成立しない
		expect(
			service.evaluate(state, { rsThreshold: 1, minGenerations: 1, minReachRate: 0.5 }).occurred,
		).toBe(false);
	});

	it('Rs > 1 が 2 世代続き Reach が閾値を超えると Cascade が成立する', () => {
		const state = buildState();
		transmit(state, 'a', 'b', 0);
		transmit(state, 'a', 'c', 0);
		// Generation 1 の 2 人が 3 人へ広げる（Rs = 1.5）
		transmit(state, 'b', 'd', 1);
		transmit(state, 'b', 'e', 1);
		transmit(state, 'c', 'f', 1);

		const status = service.evaluate(state);

		expect(status.occurred).toBe(true);
		expect(status.outbreakOccurred).toBe(true);
	});

	it('Reach が閾値未満なら Outbreak も成立しない', () => {
		const state = buildState();
		state.generations.set('a', 0);
		state.transmissions.push({
			fromAgentId: 'a',
			toAgentId: 'b',
			tick: 0,
			sleepLossMinutes: 60,
			causeEventId: 'e1',
			// 睡眠機会は奪ったが新規ケースには至っていない
			becameNewCase: false,
		});

		const status = service.evaluate(state);

		expect(status.outbreakOccurred).toBe(false);
		expect(status.reach).toBe(0);
	});

	it('Rs が閾値を超えたあと初めて落ちた世代を dampingGeneration が示す', () => {
		const state = buildState();
		transmit(state, 'a', 'b', 0);
		transmit(state, 'a', 'c', 0);

		expect(service.evaluate(state).dampingGeneration).toBe(1);
	});

	it('Rs が一度も閾値を超えなければ dampingGeneration は null', () => {
		const state = buildState();
		// Generation 0 の 1 人が 1 人だけ新規ケース化（Rs = 1、閾値超えではない）
		transmit(state, 'a', 'b', 0);

		const status = service.evaluate(state);

		expect(status.dampingGeneration).toBeNull();
		expect(status.outbreakOccurred).toBe(true);
	});
});
