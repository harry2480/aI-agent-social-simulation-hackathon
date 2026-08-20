import type { MetricsSnapshot } from '@/backend/presentation/composition/simulation.composition';
import { toRunMetricsSeries } from '@/frontend/lib/run-metrics-presentation';
import { describe, expect, it } from 'vitest';

function snapshot(overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
	return {
		tick: 0,
		currentRs: 0,
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

describe('toRunMetricsSeries', () => {
	it('Tick を 1 始まりの経過日数へ直す', () => {
		// Tick のままでは目盛りが読めない
		const series = toRunMetricsSeries([
			snapshot({ tick: 0 }),
			snapshot({ tick: 96 }),
			snapshot({ tick: 48 }),
		]);

		expect(series.map((point) => point.day)).toEqual([1, 2, 1.5]);
	});

	it('Rs は 3 桁、Sleep Debt は 1 桁へ丸める', () => {
		const series = toRunMetricsSeries([
			snapshot({ currentRs: 1.23456789, totalSleepDebtHours: 987.654 }),
		]);

		expect(series[0]?.rs).toBe(1.235);
		expect(series[0]?.sleepDebt).toBe(987.7);
	});

	it('人数と件数はそのまま渡す', () => {
		const series = toRunMetricsSeries([
			snapshot({
				sleepDeprivedPopulation: 42,
				severeSleepDeprivedPopulation: 7,
				accidentCount: 3,
			}),
		]);

		expect(series[0]).toMatchObject({ sleepDeprived: 42, severe: 7, accidents: 3 });
	});

	it('渡された順序を保つ。グラフの折れ線がねじれない', () => {
		const series = toRunMetricsSeries([
			snapshot({ tick: 0, accidentCount: 1 }),
			snapshot({ tick: 96, accidentCount: 2 }),
		]);

		expect(series.map((point) => point.accidents)).toEqual([1, 2]);
	});

	it('Metrics が無ければ空の系列', () => {
		expect(toRunMetricsSeries([])).toEqual([]);
	});
});
