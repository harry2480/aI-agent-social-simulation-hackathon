import {
	MAX_DAYS,
	MAX_POPULATION,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import {
	type BatchFormState,
	DEFAULT_BATCH_FORM,
	MAX_BATCH_SEEDS,
	batchExperimentConfig,
	batchExperimentName,
	batchProgressPercent,
	parseBatchForm,
	toComparisonResults,
} from '@/frontend/lib/experiment-batch';
import { describe, expect, it } from 'vitest';

function form(overrides: Partial<BatchFormState> = {}): BatchFormState {
	return { ...DEFAULT_BATCH_FORM, ...overrides };
}

function planOf(overrides: Partial<BatchFormState> = {}) {
	const parsed = parseBatchForm(form(overrides));
	if (!('plan' in parsed)) {
		throw new Error(`plan を期待したが error だった: ${parsed.error}`);
	}
	return parsed.plan;
}

describe('parseBatchForm', () => {
	it('Run の総数と条件数を実行前に出す', () => {
		// 何本回るのか分からないまま実行させない
		const plan = planOf({ kind: 'shock-comparison', seeds: 3 });

		expect(plan.conditionCount).toBe(4);
		expect(plan.totalRuns).toBe(12);
	});

	it('判定だけを振る実験の Run 数は Seed 数のまま', () => {
		expect(planOf({ kind: 'cascade-threshold', seeds: 3 }).totalRuns).toBe(3);
	});

	it('フォームの Population と Days を base へ反映する', () => {
		const plan = planOf({ population: 120, days: 3 });

		expect(plan.base.population).toBe(120);
		expect(plan.base.days).toBe(3);
		// Experimental Variable 以外は既定のまま固定する（要件定義 28 章）
		expect(plan.base.shockTarget).toBe('driver');
	});

	it('Population と Days は ExperimentConfig と同じ上限で弾く', () => {
		// Run を回し始めてから 1 本目で例外になると、待ち時間が無駄になる
		expect(parseBatchForm(form({ population: MAX_POPULATION + 1 }))).toEqual({
			error: `Population は 1〜${MAX_POPULATION} の整数で指定してください`,
		});
		expect(parseBatchForm(form({ days: MAX_DAYS + 1 }))).toEqual({
			error: `Days は 1〜${MAX_DAYS} の整数で指定してください`,
		});
	});

	it('Seed 数はブラウザ実行の上限で弾く', () => {
		// メインスレッドで回すため、上限が無いと 1 回の実行が数分単位になる
		expect(parseBatchForm(form({ seeds: MAX_BATCH_SEEDS + 1 }))).toEqual({
			error: `Seed 数は 1〜${MAX_BATCH_SEEDS} の整数で指定してください`,
		});
		expect(parseBatchForm(form({ seeds: 0 }))).toEqual({
			error: `Seed 数は 1〜${MAX_BATCH_SEEDS} の整数で指定してください`,
		});
	});

	it('整数でない入力を弾く', () => {
		expect('error' in parseBatchForm(form({ population: 100.5 }))).toBe(true);
		expect('error' in parseBatchForm(form({ seeds: Number.NaN }))).toBe(true);
	});

	it('Batch で回せない種別を弾く', () => {
		expect(parseBatchForm(form({ kind: 'super-spreader' as BatchFormState['kind'] }))).toEqual({
			error: '実験の種類を選んでください',
		});
	});
});

describe('batchExperimentName', () => {
	it('スクリプト実行と区別できる名前にする', () => {
		expect(batchExperimentName('critical-point', 5)).toBe('critical-point (5 seeds, browser)');
	});
});

describe('batchExperimentConfig', () => {
	it('何を固定して何を振ったかを条件スナップショットへ残す', () => {
		const config = batchExperimentConfig(planOf({ kind: 'intervention', seeds: 2 }));

		expect(config.seeds).toBe(2);
		expect(config.executedIn).toBe('browser');
		expect(config.conditions).toEqual([
			'none',
			'mandatory-rest',
			'overtime-limit',
			'flexible-work',
			'remote-work',
		]);
	});
});

describe('batchProgressPercent', () => {
	it('総数が 0 でも NaN にしない', () => {
		expect(batchProgressPercent(0, 0)).toBe(0);
	});

	it('進捗を百分率にし、100 を超えない', () => {
		expect(batchProgressPercent(5, 20)).toBe(25);
		expect(batchProgressPercent(21, 20)).toBe(100);
	});
});

describe('toComparisonResults', () => {
	it('集計そのものを aggregate へ入れ、保存前後で表示を変えない', () => {
		const aggregate = {
			label: 'driver-shock',
			runCount: 2,
			cascadeProbability: 0,
			outbreakProbability: 0.5,
			averageDampingGeneration: null,
			averageRs: 1,
			peakRs: 2,
			averageReach: 10,
			totalSleepLossMinutes: 100,
			standardDeviation: 1,
			averageSleepDebtHours: 50,
			averageCascadeDepth: 2,
			averageAccidentCount: 3,
			averageOvertimeHours: 4,
			averageCommuteDelayMinutes: 5,
		};

		expect(toComparisonResults([aggregate])).toEqual([{ ...aggregate, aggregate }]);
	});
});
