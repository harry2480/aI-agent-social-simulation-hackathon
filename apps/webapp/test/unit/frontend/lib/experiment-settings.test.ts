import {
	DEFAULT_EXPERIMENT_SETTINGS,
	type ExperimentSettings,
	parseSettings,
	toExperimentConfigParams,
	validateSettings,
} from '@/frontend/lib/experiment-settings';
import { describe, expect, it } from 'vitest';

function settings(overrides: Partial<ExperimentSettings> = {}): ExperimentSettings {
	return { ...DEFAULT_EXPERIMENT_SETTINGS, ...overrides };
}

describe('validateSettings', () => {
	it('既定値は有効', () => {
		expect(validateSettings(DEFAULT_EXPERIMENT_SETTINGS)).toBeNull();
	});

	it('Population と Days は上限を超えられない', () => {
		expect(validateSettings(settings({ population: 501 }))).toBe('POPULATION_OUT_OF_RANGE');
		expect(validateSettings(settings({ days: 15 }))).toBe('DAYS_OUT_OF_RANGE');
	});

	it('Population と Days は整数のみ', () => {
		expect(validateSettings(settings({ population: 10.5 }))).toBe('POPULATION_OUT_OF_RANGE');
		expect(validateSettings(settings({ days: 1.5 }))).toBe('DAYS_OUT_OF_RANGE');
	});

	it('Seed は整数のみ', () => {
		expect(validateSettings(settings({ seed: 1.5 }))).toBe('SEED_NOT_INTEGER');
	});

	it('初期睡眠不足率は 0〜1', () => {
		expect(validateSettings(settings({ initialSleepDeprivedRate: 1.1 }))).toBe(
			'INITIAL_SLEEP_DEPRIVED_RATE_OUT_OF_RANGE',
		);
	});

	it('Traffic Level は 0 より大きい', () => {
		expect(validateSettings(settings({ trafficLevel: 0 }))).toBe('TRAFFIC_LEVEL_OUT_OF_RANGE');
	});

	it('睡眠状態の閾値は昇順でなければならない', () => {
		expect(
			validateSettings(
				settings({ sleepStateThresholds: { tired: 3, sleepDeprived: 2, severe: 5 } }),
			),
		).toBe('SLEEP_STATE_THRESHOLDS_NOT_ASCENDING');
	});

	it('Cascade 判定の Generation は 1 以上の整数', () => {
		expect(
			validateSettings(
				settings({ cascadeThresholds: { rsThreshold: 1, minGenerations: 0, minReachRate: 0.1 } }),
			),
		).toBe('CASCADE_THRESHOLDS_OUT_OF_RANGE');
	});
});

describe('parseSettings', () => {
	it('保存された値を読み戻す', () => {
		const parsed = parseSettings({
			seed: 7,
			population: 100,
			days: 3,
			initialSleepDeprivedRate: 0.2,
			initialSleepDebtHours: 4,
			shockTarget: 'manager',
			trafficLevel: 1.5,
			intervention: 'remote_work',
			aiDecisionEnabled: true,
			sleepStateThresholds: { tired: 1.5, sleepDeprived: 3, severe: 6 },
			cascadeThresholds: { rsThreshold: 1.2, minGenerations: 3, minReachRate: 0.2 },
		});

		expect(parsed.seed).toBe(7);
		expect(parsed.shockTarget).toBe('manager');
		expect(parsed.intervention).toBe('remote_work');
		expect(parsed.sleepStateThresholds.severe).toBe(6);
		expect(parsed.cascadeThresholds.minGenerations).toBe(3);
	});

	it('壊れた値は既定値で補う', () => {
		const parsed = parseSettings({
			seed: 'broken',
			shockTarget: 'unknown',
			intervention: 'unknown',
		});

		expect(parsed.seed).toBe(DEFAULT_EXPERIMENT_SETTINGS.seed);
		expect(parsed.shockTarget).toBe(DEFAULT_EXPERIMENT_SETTINGS.shockTarget);
		expect(parsed.intervention).toBeNull();
	});

	it('object でなければ既定値を返す', () => {
		expect(parseSettings(null)).toEqual(DEFAULT_EXPERIMENT_SETTINGS);
		expect(parseSettings('broken')).toEqual(DEFAULT_EXPERIMENT_SETTINGS);
	});
});

describe('toExperimentConfigParams', () => {
	it('Run のパラメータへ変換する（閾値も引き継ぐ）', () => {
		const params = toExperimentConfigParams(
			settings({
				trafficLevel: 1.5,
				sleepStateThresholds: { tired: 2, sleepDeprived: 3, severe: 6 },
			}),
		);

		expect(params.trafficLevel).toBe(1.5);
		expect(params.sleepStateThresholds?.severe).toBe(6);
		expect(params.intervention).toBeNull();
	});
});
