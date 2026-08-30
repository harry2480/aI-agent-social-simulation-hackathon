import type { MetricsSnapshot } from '@/backend/presentation/composition/watch-mode-engine.composition';
import { buildKpiRows } from '@/frontend/lib/kpi-presentation';
import { describe, expect, it } from 'vitest';

function metrics(overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
	return {
		tick: 0,
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
		...overrides,
	};
}

function rowValue(rows: ReturnType<typeof buildKpiRows>, label: string): string | undefined {
	return rows.find((row) => row.label === label)?.value;
}

describe('buildKpiRows', () => {
	it('Metrics が無くても同じ並び・同じ行数を返す', () => {
		// 行数が変わるとレイアウトが揺れる
		const empty = buildKpiRows(null, 300);
		const filled = buildKpiRows(metrics(), 300);

		expect(empty.map((row) => row.label)).toEqual(filled.map((row) => row.label));
	});

	it('Metrics が無いときは全項目を - にする', () => {
		// Run 開始前と「値が 0」を取り違えないようにする
		expect(buildKpiRows(null, 300).every((row) => row.value === '-')).toBe(true);
	});

	it('Sleep-Deprived は Population との比で出す', () => {
		const rows = buildKpiRows(metrics({ sleepDeprivedPopulation: 42 }), 300);

		expect(rowValue(rows, 'Sleep-Deprived')).toBe('42 / 300');
	});

	it('Rs は小数 2 桁、Sleep Debt と Overtime は 1 桁で出す', () => {
		const rows = buildKpiRows(
			metrics({ currentRs: 1.23456, totalSleepDebtHours: 98.765, overtimeHours: 12.34 }),
			300,
		);

		expect(rowValue(rows, 'Current Rs')).toBe('1.23');
		expect(rowValue(rows, 'Total Sleep Debt')).toBe('98.8 h');
		expect(rowValue(rows, 'Overtime')).toBe('12.3 h');
	});

	it('Sleep Loss は分ではなく時間へ直して出す', () => {
		const rows = buildKpiRows(metrics({ totalSleepLossMinutes: 90 }), 300);

		expect(rowValue(rows, 'Total Sleep Loss')).toBe('1.5 h');
	});

	it('人数系は 3 桁区切りの整数で出す', () => {
		const rows = buildKpiRows(metrics({ cascadeReach: 1234 }), 5000);

		expect(rowValue(rows, 'Cascade Reach')).toBe('1,234');
	});

	it('Peak Rs と Average Rs を Current Rs と並べて出す', () => {
		// 要件定義 25 章。Run 終了を待たずに増幅の勢いを読めるようにする
		const rows = buildKpiRows(metrics({ currentRs: 0.5, peakRs: 2.25, averageRs: 1.125 }), 300);

		expect(rowValue(rows, 'Peak Rs')).toBe('2.25');
		expect(rowValue(rows, 'Average Rs')).toBe('1.13');
	});

	it('Traffic Delay は渋滞の累計分を出す', () => {
		// 1 人あたりの平均を出す Avg Commute Delay とは別の指標
		const rows = buildKpiRows(
			metrics({ trafficDelayMinutes: 1234, averageCommuteDelayMinutes: 5.6 }),
			300,
		);

		expect(rowValue(rows, 'Traffic Delay')).toBe('1,234 min');
		expect(rowValue(rows, 'Avg Commute Delay')).toBe('5.6 min');
	});

	it('値が 0 のときは 0 を出す。- にはしない', () => {
		const rows = buildKpiRows(metrics(), 300);

		expect(rowValue(rows, 'Accidents')).toBe('0');
		expect(rowValue(rows, 'Current Rs')).toBe('0.00');
	});
});
