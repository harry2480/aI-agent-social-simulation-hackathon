import type {
	ExperimentAggregate,
	StoredRun,
} from '@/backend/presentation/composition/simulation.composition';
import {
	describeRunCondition,
	formatDelta,
	formatPercent,
	groupRunsByCondition,
	toComparisonRows,
} from '@/frontend/lib/experiment-presentation';
import { describe, expect, it } from 'vitest';

function aggregate(label: string, averageReach: number): ExperimentAggregate {
	return {
		label,
		runCount: 10,
		cascadeProbability: 0.4,
		averageRs: 0.8,
		peakRs: 1.2,
		averageReach,
		totalSleepLossMinutes: 1000,
		standardDeviation: 2.5,
		aggregate: null,
	};
}

function run(id: string, config: unknown): StoredRun {
	return {
		id,
		experimentId: 'exp-1',
		seed: 1,
		population: 300,
		days: 7,
		intervention: null,
		aiModel: null,
		status: 'completed',
		config,
		summary: null,
	};
}

describe('toComparisonRows', () => {
	it('対照条件からの Cascade Reach 差を併記する', () => {
		const rows = toComparisonRows([aggregate('baseline', 10), aggregate('driver-shock', 25)]);

		expect(rows[0].reachDeltaVsControl).toBeNull();
		expect(rows[1].reachDeltaVsControl).toBe(15);
	});

	it('intervention 実験では none を対照として扱う', () => {
		const rows = toComparisonRows([aggregate('none', 30), aggregate('mandatory-rest', 18)]);

		expect(rows[1].reachDeltaVsControl).toBe(-12);
	});

	it('対照条件が無ければ差は出さない', () => {
		const rows = toComparisonRows([
			aggregate('initial-rate-1%', 5),
			aggregate('initial-rate-5%', 20),
		]);

		expect(rows.every((row) => row.reachDeltaVsControl === null)).toBe(true);
	});

	it('条件の並び順を保つ', () => {
		const rows = toComparisonRows([aggregate('baseline', 10), aggregate('driver-shock', 25)]);

		expect(rows.map((row) => row.label)).toEqual(['baseline', 'driver-shock']);
	});
});

describe('describeRunCondition', () => {
	it('Config から Experimental Variable を読み取る', () => {
		const label = describeRunCondition({
			shockTarget: 'driver',
			initialSleepDeprivedRate: 0.1,
			intervention: 'mandatory_rest',
		});

		expect(label).toBe('shock: driver / initial: 10% / intervention: mandatory_rest');
	});

	it('intervention 未設定は none と表示する', () => {
		expect(describeRunCondition({ shockTarget: 'none', initialSleepDeprivedRate: 0 })).toBe(
			'shock: none / initial: 0% / intervention: none',
		);
	});

	it('Config が壊れていても落ちない', () => {
		expect(describeRunCondition(null)).toBe('-');
		expect(describeRunCondition('broken')).toBe('-');
	});
});

describe('groupRunsByCondition', () => {
	it('同一条件の Run をまとめる', () => {
		const grouped = groupRunsByCondition([
			run('r1', { shockTarget: 'driver', initialSleepDeprivedRate: 0.1 }),
			run('r2', { shockTarget: 'driver', initialSleepDeprivedRate: 0.1 }),
			run('r3', { shockTarget: 'none', initialSleepDeprivedRate: 0 }),
		]);

		expect(grouped.size).toBe(2);
		expect(grouped.get('shock: driver / initial: 10% / intervention: none')).toHaveLength(2);
	});
});

describe('formatPercent / formatDelta', () => {
	it('割合を百分率にする', () => {
		expect(formatPercent(0.4)).toBe('40%');
		expect(formatPercent(Number.NaN)).toBe('-');
	});

	it('増減の符号を明示する', () => {
		expect(formatDelta(15)).toBe('+15.0');
		expect(formatDelta(-12)).toBe('-12.0');
		expect(formatDelta(null)).toBe('-');
	});
});
