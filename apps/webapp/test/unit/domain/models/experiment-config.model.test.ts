import {
	DEFAULT_CASCADE_THRESHOLDS,
	ExperimentConfig,
} from '@/backend/domain/models/experiment-config.model';
import { DEFAULT_SLEEP_STATE_THRESHOLDS } from '@/backend/domain/models/sleep-state.model';
import { describe, expect, it } from 'vitest';

const valid = {
	seed: 42,
	population: 300,
	days: 7,
	initialSleepDeprivedRate: 0.1,
};

describe('ExperimentConfig', () => {
	describe('create', () => {
		it('未指定の項目に既定値を入れる', () => {
			const config = ExperimentConfig.create(valid);
			expect(config.shockTarget).toBe('none');
			expect(config.trafficLevel).toBe(1);
			expect(config.intervention).toBeNull();
			expect(config.aiModel).toBeNull();
			expect(config.aiDecisionEnabled).toBe(false);
			expect(config.initialSleepDebtHours).toBe(3);
			expect(config.sleepStateThresholds).toEqual(DEFAULT_SLEEP_STATE_THRESHOLDS);
			expect(config.cascadeThresholds).toEqual(DEFAULT_CASCADE_THRESHOLDS);
		});

		it('totalTicks は days × 96', () => {
			expect(ExperimentConfig.create(valid).totalTicks).toBe(7 * 96);
		});

		it('seed が整数でなければ拒否する', () => {
			expect(() => ExperimentConfig.create({ ...valid, seed: 1.5 })).toThrow(/seed/);
		});

		it.each([0, 501])('population %s を拒否する', (population) => {
			expect(() => ExperimentConfig.create({ ...valid, population })).toThrow(/population/);
		});

		it.each([1, 500])('population %s を受け入れる', (population) => {
			expect(ExperimentConfig.create({ ...valid, population }).population).toBe(population);
		});

		it.each([0, 15])('days %s を拒否する', (days) => {
			expect(() => ExperimentConfig.create({ ...valid, days })).toThrow(/days/);
		});

		it.each([1, 14])('days %s を受け入れる', (days) => {
			expect(ExperimentConfig.create({ ...valid, days }).days).toBe(days);
		});

		it.each([-0.1, 1.1])('初期睡眠不足率 %s を拒否する', (initialSleepDeprivedRate) => {
			expect(() => ExperimentConfig.create({ ...valid, initialSleepDeprivedRate })).toThrow(
				/initialSleepDeprivedRate/,
			);
		});

		it('閾値を上書きできる', () => {
			const thresholds = { tired: 0.5, sleepDeprived: 1, severe: 2 };
			const config = ExperimentConfig.create({ ...valid, sleepStateThresholds: thresholds });
			expect(config.sleepStateThresholds).toEqual(thresholds);
		});
	});

	describe('withOverrides', () => {
		it('指定した項目だけを差し替える', () => {
			const base = ExperimentConfig.create({ ...valid, shockTarget: 'driver' });
			const next = base.withOverrides({ seed: 99 });
			expect(next.seed).toBe(99);
			expect(next.population).toBe(base.population);
			expect(next.shockTarget).toBe('driver');
		});

		it('intervention に null を渡すと介入なしへ戻せる', () => {
			const base = ExperimentConfig.create({ ...valid, intervention: 'mandatory_rest' });
			expect(base.withOverrides({ intervention: null }).intervention).toBeNull();
		});

		it('intervention を省略すると元の値を保つ', () => {
			const base = ExperimentConfig.create({ ...valid, intervention: 'mandatory_rest' });
			expect(base.withOverrides({ seed: 7 }).intervention).toBe('mandatory_rest');
		});

		it('比較実験では Experimental Variable 以外が固定される', () => {
			const base = ExperimentConfig.create({ ...valid, seed: 42, shockTarget: 'driver' });
			const withIntervention = base.withOverrides({ intervention: 'overtime_limit' });
			expect(withIntervention.seed).toBe(base.seed);
			expect(withIntervention.population).toBe(base.population);
			expect(withIntervention.trafficLevel).toBe(base.trafficLevel);
			expect(withIntervention.initialSleepDeprivedRate).toBe(base.initialSleepDeprivedRate);
			expect(withIntervention.intervention).toBe('overtime_limit');
		});
	});
});
