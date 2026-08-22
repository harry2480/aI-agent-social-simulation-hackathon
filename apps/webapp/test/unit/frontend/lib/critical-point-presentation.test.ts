import type { ExperimentAggregate } from '@/backend/presentation/composition/simulation.composition';
import {
	findCriticalPointRange,
	parseInitialRateLabel,
	toCriticalPointChartData,
	toCriticalPointSeries,
} from '@/frontend/lib/critical-point-presentation';
import { describe, expect, it } from 'vitest';

function aggregate(label: string, cascadeProbability: number): ExperimentAggregate {
	return {
		label,
		runCount: 10,
		cascadeProbability,
		averageRs: 1,
		peakRs: 1.5,
		averageReach: 20,
		totalSleepLossMinutes: 100,
		standardDeviation: 1,
		aggregate: null,
	};
}

describe('parseInitialRateLabel', () => {
	it('Batch Runner のラベルから初期率を取り出す', () => {
		expect(parseInitialRateLabel('initial-rate-5%')).toBe(0.05);
		expect(parseInitialRateLabel('initial-rate-20%')).toBe(0.2);
	});

	it('Sweep 以外のラベルは対象外', () => {
		expect(parseInitialRateLabel('baseline')).toBeNull();
		expect(parseInitialRateLabel('driver-shock')).toBeNull();
	});
});

describe('toCriticalPointSeries', () => {
	it('初期率の昇順へ並べ替える', () => {
		const series = toCriticalPointSeries([
			aggregate('initial-rate-10%', 0.6),
			aggregate('initial-rate-1%', 0.1),
			aggregate('initial-rate-5%', 0.3),
		]);

		expect(series.map((sample) => sample.initialRate)).toEqual([0.01, 0.05, 0.1]);
	});

	it('Sweep 以外の条件は除外する', () => {
		const series = toCriticalPointSeries([
			aggregate('baseline', 0),
			aggregate('initial-rate-3%', 0.2),
		]);

		expect(series).toHaveLength(1);
	});
});

describe('findCriticalPointRange', () => {
	it('50% をはじめて超えた点とその直前で臨界点を挟む', () => {
		const series = toCriticalPointSeries([
			aggregate('initial-rate-1%', 0.1),
			aggregate('initial-rate-5%', 0.4),
			aggregate('initial-rate-7%', 0.7),
		]);

		expect(findCriticalPointRange(series)).toEqual({ lowerRate: 0.05, upperRate: 0.07 });
	});

	it('最初の点で既に超えていれば下限は無い', () => {
		const series = toCriticalPointSeries([aggregate('initial-rate-1%', 0.8)]);

		expect(findCriticalPointRange(series)).toEqual({ lowerRate: null, upperRate: 0.01 });
	});

	it('Sweep 結果が空なら臨界点は示さない', () => {
		expect(findCriticalPointRange([])).toBeNull();
	});

	it('どこも 50% に届かなければ臨界点は示さない', () => {
		const series = toCriticalPointSeries([
			aggregate('initial-rate-1%', 0.1),
			aggregate('initial-rate-20%', 0.49),
		]);

		expect(findCriticalPointRange(series)).toBeNull();
	});
});

describe('toCriticalPointChartData', () => {
	it('率を % へ直し、グラフの目盛りに合わせて丸める', () => {
		const data = toCriticalPointChartData([
			{
				initialRate: 0.075,
				cascadeProbability: 0.3333,
				averageReach: 12.345,
				averageRs: 1,
				standardDeviation: 0,
				runCount: 10,
			},
		]);

		expect(data).toEqual([{ rate: 7.5, probability: 33.3, reach: 12.3 }]);
	});

	it('渡された順序を保つ。曲線がねじれない', () => {
		const sample = (initialRate: number) => ({
			initialRate,
			cascadeProbability: 0,
			averageReach: 0,
			averageRs: 0,
			standardDeviation: 0,
			runCount: 1,
		});

		expect(toCriticalPointChartData([sample(0.01), sample(0.2)]).map((p) => p.rate)).toEqual([
			1, 20,
		]);
	});

	it('Sweep 結果が無ければ空', () => {
		expect(toCriticalPointChartData([])).toEqual([]);
	});
});
