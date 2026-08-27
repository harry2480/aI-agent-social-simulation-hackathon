import type {
	ExperimentAggregate,
	StoredExperiment,
	StoredRun,
} from '@/backend/presentation/composition/simulation.composition';
import {
	describeRunCondition,
	findExperimentOfKind,
	formatDelta,
	formatPercent,
	groupRunsByCondition,
	toComparisonRows,
} from '@/frontend/lib/experiment-presentation';
import { describe, expect, it } from 'vitest';

function experiment(id: string, kind: string): StoredExperiment {
	return { id, name: `${kind} experiment`, kind, config: null, results: [] };
}

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

describe('toComparisonRows の補助指標', () => {
	it('aggregate JSON から Outbreak 発生率と収束世代を読む', () => {
		const rows = toComparisonRows([
			{
				...aggregate('driver-shock', 58.5),
				aggregate: { outbreakProbability: 1, averageDampingGeneration: 1.5 },
			},
		]);

		expect(rows[0]?.outbreakProbability).toBe(1);
		expect(rows[0]?.averageDampingGeneration).toBe(1.5);
	});

	it('補助指標を持たない過去の実験では null になる', () => {
		const rows = toComparisonRows([aggregate('baseline', 9)]);

		expect(rows[0]?.outbreakProbability).toBeNull();
		expect(rows[0]?.averageDampingGeneration).toBeNull();
	});

	it('aggregate JSON から介入の副作用指標を読む', () => {
		const rows = toComparisonRows([
			{
				...aggregate('mandatory-rest', 12),
				aggregate: {
					averageSleepDebtHours: 150,
					averageCascadeDepth: 3,
					averageAccidentCount: 5,
					averageOvertimeHours: 40,
					averageCommuteDelayMinutes: 15,
				},
			},
		]);

		expect(rows[0]?.averageSleepDebtHours).toBe(150);
		expect(rows[0]?.averageCascadeDepth).toBe(3);
		expect(rows[0]?.averageAccidentCount).toBe(5);
		expect(rows[0]?.averageOvertimeHours).toBe(40);
		expect(rows[0]?.averageCommuteDelayMinutes).toBe(15);
	});

	it('副作用指標を持たない過去の実験では null になる', () => {
		const rows = toComparisonRows([aggregate('baseline', 9)]);

		expect(rows[0]?.averageSleepDebtHours).toBeNull();
		expect(rows[0]?.averageCascadeDepth).toBeNull();
		expect(rows[0]?.averageAccidentCount).toBeNull();
		expect(rows[0]?.averageOvertimeHours).toBeNull();
		expect(rows[0]?.averageCommuteDelayMinutes).toBeNull();
	});

	it('数値以外が入っていても null として扱う', () => {
		const rows = toComparisonRows([
			{
				...aggregate('baseline', 9),
				aggregate: {
					outbreakProbability: '1',
					averageDampingGeneration: null,
					averageAccidentCount: Number.NaN,
				},
			},
		]);

		expect(rows[0]?.outbreakProbability).toBeNull();
		expect(rows[0]?.averageDampingGeneration).toBeNull();
		expect(rows[0]?.averageAccidentCount).toBeNull();
	});
});

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

describe('findExperimentOfKind', () => {
	it('指定した kind の実験を返す', () => {
		const experiments = [experiment('a', 'shock-comparison'), experiment('b', 'critical-point')];

		expect(findExperimentOfKind(experiments, 'critical-point')?.id).toBe('b');
	});

	it('同じ kind が複数あれば先頭（最新）を返す', () => {
		// loadRecentExperiments は新しい順に返す
		const experiments = [experiment('new', 'super-spreader'), experiment('old', 'super-spreader')];

		expect(findExperimentOfKind(experiments, 'super-spreader')?.id).toBe('new');
	});

	it('該当が無ければ null を返す', () => {
		// undefined ではなく null。画面は null を空状態の分岐に使う
		expect(findExperimentOfKind([experiment('a', 'intervention')], 'critical-point')).toBeNull();
		expect(findExperimentOfKind([], 'critical-point')).toBeNull();
	});
});
