import {
	aggregateSummaries,
	averageDampingGeneration,
	isConditionAggregate,
	normalizeConditionAggregate,
	standardDeviation,
} from '@/backend/domain/models/experiment-aggregate.model';
import type { RunSummary } from '@/backend/domain/models/metrics.model';
import { describe, expect, it } from 'vitest';

function summary(overrides: Partial<RunSummary> = {}): RunSummary {
	return {
		currentRs: 0,
		peakRs: 0,
		averageRs: 0,
		sleepDeprivedPopulation: 0,
		severeSleepDeprivedPopulation: 0,
		totalSleepDebtHours: 0,
		totalSleepLossMinutes: 0,
		cascadeReach: 0,
		cascadeDepth: 0,
		cascadeGeneration: 0,
		accidentCount: 0,
		trafficDelayMinutes: 0,
		overtimeHours: 0,
		averageCommuteDelayMinutes: 0,
		cascadeOccurred: false,
		outbreakOccurred: false,
		dampingGeneration: null,
		...overrides,
	};
}

describe('standardDeviation', () => {
	it('母集団の標準偏差を返す', () => {
		expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 10);
	});

	it('ばらつきが無ければ 0', () => {
		expect(standardDeviation([3, 3, 3])).toBe(0);
	});

	it('空配列でも NaN にせず 0 を返す', () => {
		expect(standardDeviation([])).toBe(0);
	});
});

describe('averageDampingGeneration', () => {
	it('収束した Run だけの平均を取る', () => {
		// 一度も閾値を超えなかった Run は「収束する山が無かった」ため対象から除く
		const summaries = [
			summary({ dampingGeneration: 2 }),
			summary({ dampingGeneration: 4 }),
			summary({ dampingGeneration: null }),
		];

		expect(averageDampingGeneration(summaries)).toBe(3);
	});

	it('どの Run も閾値を超えなければ null', () => {
		expect(averageDampingGeneration([summary(), summary()])).toBeNull();
	});

	it('世代 0 を「収束しなかった」と取り違えない', () => {
		expect(averageDampingGeneration([summary({ dampingGeneration: 0 })])).toBe(0);
	});
});

describe('aggregateSummaries', () => {
	it('Cascade と Outbreak の発生率を別々に数える', () => {
		// Cascade 判定は成立しないが一度大きく広がる条件を取りこぼさないため
		const summaries = [
			summary({ cascadeOccurred: true, outbreakOccurred: true }),
			summary({ cascadeOccurred: false, outbreakOccurred: true }),
			summary({ cascadeOccurred: false, outbreakOccurred: false }),
			summary({ cascadeOccurred: false, outbreakOccurred: false }),
		];

		const aggregate = aggregateSummaries('driver-shock', summaries);

		expect(aggregate.cascadeProbability).toBe(0.25);
		expect(aggregate.outbreakProbability).toBe(0.5);
	});

	it('Rs は平均と Peak を分けて持つ', () => {
		const summaries = [summary({ averageRs: 1, peakRs: 2 }), summary({ averageRs: 2, peakRs: 5 })];

		const aggregate = aggregateSummaries('label', summaries);

		expect(aggregate.averageRs).toBe(1.5);
		// Peak は Run をまたいだ最大値。平均すると尖りが消える
		expect(aggregate.peakRs).toBe(5);
	});

	it('Cascade Reach は平均と標準偏差を併記する', () => {
		const summaries = [
			summary({ cascadeReach: 10 }),
			summary({ cascadeReach: 20 }),
			summary({ cascadeReach: 30 }),
		];

		const aggregate = aggregateSummaries('label', summaries);

		expect(aggregate.averageReach).toBe(20);
		expect(aggregate.standardDeviation).toBeCloseTo(8.16496580927726, 10);
	});

	it('Sleep Loss は合計ではなく Run あたりの平均を入れる', () => {
		// フィールド名は totalSleepLossMinutes だが、Seed 数が違う条件を並べるため平均で持つ
		const summaries = [
			summary({ totalSleepLossMinutes: 100 }),
			summary({ totalSleepLossMinutes: 300 }),
		];

		expect(aggregateSummaries('label', summaries).totalSleepLossMinutes).toBe(200);
	});

	it('介入の副作用を読む指標を Run あたりの平均で持つ', () => {
		// 伝播が減っても事故や残業が増えているなら、その介入は成功と言えない（要件定義 32 章）
		const summaries = [
			summary({
				totalSleepDebtHours: 100,
				cascadeDepth: 2,
				accidentCount: 4,
				overtimeHours: 30,
				averageCommuteDelayMinutes: 10,
			}),
			summary({
				totalSleepDebtHours: 200,
				cascadeDepth: 4,
				accidentCount: 6,
				overtimeHours: 50,
				averageCommuteDelayMinutes: 20,
			}),
		];

		const aggregate = aggregateSummaries('mandatory-rest', summaries);

		expect(aggregate.averageSleepDebtHours).toBe(150);
		expect(aggregate.averageCascadeDepth).toBe(3);
		expect(aggregate.averageAccidentCount).toBe(5);
		expect(aggregate.averageOvertimeHours).toBe(40);
		expect(aggregate.averageCommuteDelayMinutes).toBe(15);
	});

	it('ラベルと Run 数をそのまま持つ', () => {
		const aggregate = aggregateSummaries('mandatory-rest', [summary(), summary()]);

		expect(aggregate.label).toBe('mandatory-rest');
		expect(aggregate.runCount).toBe(2);
	});

	it('Run が 0 本なら例外にする', () => {
		// 平均が NaN、Peak Rs が -Infinity のまま DB へ入るのを防ぐ
		expect(() => aggregateSummaries('baseline', [])).toThrow('Run が 1 本もありません');
	});
});

describe('isConditionAggregate', () => {
	const valid = aggregateSummaries('driver-shock', [summary()]);

	it('集計そのものを受け付ける', () => {
		expect(isConditionAggregate(valid)).toBe(true);
	});

	it('項目が欠けていれば弾く', () => {
		// ブラウザ実行の結果は Server Action 経由で届くため、欠けた項目をそのまま保存しない
		const { averageReach: _averageReach, ...missing } = valid;
		expect(isConditionAggregate(missing)).toBe(false);
	});

	it('NaN や Infinity を弾く', () => {
		expect(isConditionAggregate({ ...valid, peakRs: Number.NaN })).toBe(false);
		expect(isConditionAggregate({ ...valid, averageReach: Number.POSITIVE_INFINITY })).toBe(false);
	});

	it('ラベルが空、または Run が 0 本の集計を弾く', () => {
		expect(isConditionAggregate({ ...valid, label: '' })).toBe(false);
		expect(isConditionAggregate({ ...valid, runCount: 0 })).toBe(false);
	});

	it('収束世代は数値でも null でもよい', () => {
		expect(isConditionAggregate({ ...valid, averageDampingGeneration: null })).toBe(true);
		expect(isConditionAggregate({ ...valid, averageDampingGeneration: 2 })).toBe(true);
		expect(isConditionAggregate({ ...valid, averageDampingGeneration: 'x' })).toBe(false);
	});

	it('オブジェクト以外を弾く', () => {
		expect(isConditionAggregate(null)).toBe(false);
		expect(isConditionAggregate('driver-shock')).toBe(false);
	});
});

describe('normalizeConditionAggregate', () => {
	it('検証済みのキーだけを写す', () => {
		// 呼び出し側が付けた項目をそのまま保存すると aggregate_json が汚れる
		const aggregate = aggregateSummaries('driver-shock', [summary()]);
		const normalized = normalizeConditionAggregate({
			...aggregate,
			injected: 'x',
		} as typeof aggregate);

		expect(normalized).toEqual(aggregate);
		expect('injected' in normalized).toBe(false);
	});

	it('長すぎるラベルを切り詰める', () => {
		const aggregate = aggregateSummaries('a'.repeat(200), [summary()]);

		expect(normalizeConditionAggregate(aggregate).label).toHaveLength(120);
	});
});
