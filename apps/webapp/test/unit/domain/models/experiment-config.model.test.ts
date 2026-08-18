import {
	DEFAULT_CASCADE_THRESHOLDS,
	ExperimentConfig,
	type ExperimentConfigError,
	type ExperimentConfigParams,
} from '@/backend/domain/models/experiment-config.model';
import { DEFAULT_SLEEP_STATE_THRESHOLDS } from '@/backend/domain/models/sleep-state.model';
import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../../helpers/experiment-config';

const valid: ExperimentConfigParams = {
	seed: 42,
	population: 300,
	days: 7,
	initialSleepDeprivedRate: 0.1,
};

function expectError(params: ExperimentConfigParams, error: ExperimentConfigError): void {
	const result = ExperimentConfig.create(params);
	expect(result.success).toBe(false);
	if (!result.success) {
		expect(result.error).toBe(error);
	}
}

describe('ExperimentConfig', () => {
	describe('create', () => {
		it('成功時は Result の value に Config を入れて返す', () => {
			const result = ExperimentConfig.create(valid);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.seed).toBe(42);
			}
		});

		it('未指定の項目に既定値を入れる', () => {
			const config = createTestConfig(valid);
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
			expect(createTestConfig(valid).totalTicks).toBe(7 * 96);
		});

		it('ドメインルール違反は例外ではなく Result で返す', () => {
			expect(() => ExperimentConfig.create({ ...valid, population: 0 })).not.toThrow();
		});

		it('seed が整数でなければ SEED_NOT_INTEGER', () => {
			expectError({ ...valid, seed: 1.5 }, 'SEED_NOT_INTEGER');
		});

		it.each([0, 501])('population %s は POPULATION_OUT_OF_RANGE', (population) => {
			expectError({ ...valid, population }, 'POPULATION_OUT_OF_RANGE');
		});

		it.each([1, 500])('population %s を受け入れる', (population) => {
			expect(createTestConfig({ ...valid, population }).population).toBe(population);
		});

		it.each([0, 15])('days %s は DAYS_OUT_OF_RANGE', (days) => {
			expectError({ ...valid, days }, 'DAYS_OUT_OF_RANGE');
		});

		it.each([1, 14])('days %s を受け入れる', (days) => {
			expect(createTestConfig({ ...valid, days }).days).toBe(days);
		});

		it.each([-0.1, 1.1])(
			'初期睡眠不足率 %s は INITIAL_SLEEP_DEPRIVED_RATE_OUT_OF_RANGE',
			(initialSleepDeprivedRate) => {
				expectError(
					{ ...valid, initialSleepDeprivedRate },
					'INITIAL_SLEEP_DEPRIVED_RATE_OUT_OF_RANGE',
				);
			},
		);

		it('閾値を上書きできる', () => {
			const thresholds = { tired: 0.5, sleepDeprived: 1, severe: 2 };
			expect(
				createTestConfig({ ...valid, sleepStateThresholds: thresholds }).sleepStateThresholds,
			).toEqual(thresholds);
		});
	});

	describe('withOverrides', () => {
		it('指定した項目だけを差し替える', () => {
			const base = createTestConfig({ ...valid, shockTarget: 'driver' });
			const result = base.withOverrides({ seed: 99 });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.seed).toBe(99);
				expect(result.value.population).toBe(base.population);
				expect(result.value.shockTarget).toBe('driver');
			}
		});

		it('不正な値を渡した場合も Result で返す', () => {
			const base = createTestConfig(valid);
			const result = base.withOverrides({ population: 9999 });

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error).toBe('POPULATION_OUT_OF_RANGE');
			}
		});

		it('intervention に null を渡すと介入なしへ戻せる', () => {
			const base = createTestConfig({ ...valid, intervention: 'mandatory_rest' });
			const result = base.withOverrides({ intervention: null });
			expect(result.success && result.value.intervention).toBeNull();
		});

		it('intervention を省略すると元の値を保つ', () => {
			const base = createTestConfig({ ...valid, intervention: 'mandatory_rest' });
			const result = base.withOverrides({ seed: 7 });
			expect(result.success && result.value.intervention).toBe('mandatory_rest');
		});

		it('比較実験では Experimental Variable 以外が固定される', () => {
			const base = createTestConfig({ ...valid, seed: 42, shockTarget: 'driver' });
			const result = base.withOverrides({ intervention: 'overtime_limit' });

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.value.seed).toBe(base.seed);
				expect(result.value.population).toBe(base.population);
				expect(result.value.trafficLevel).toBe(base.trafficLevel);
				expect(result.value.initialSleepDeprivedRate).toBe(base.initialSleepDeprivedRate);
				expect(result.value.intervention).toBe('overtime_limit');
			}
		});
	});
});
