import type {
	ExperimentAggregate,
	StoredRun,
} from '@/backend/presentation/composition/simulation.composition';
import { buildExperimentReport } from '@/frontend/lib/experiment-report';
import { describe, expect, it } from 'vitest';

function aggregate(
	label: string,
	overrides: Partial<ExperimentAggregate> = {},
): ExperimentAggregate {
	return {
		label,
		runCount: 10,
		cascadeProbability: 0.3,
		averageRs: 0.6,
		peakRs: 0.9,
		averageReach: 10,
		totalSleepLossMinutes: 500,
		standardDeviation: 1,
		aggregate: null,
		...overrides,
	};
}

function run(config: unknown, accidentCount: number, overtimeHours: number): StoredRun {
	return {
		id: `run-${accidentCount}-${overtimeHours}`,
		experimentId: 'exp-1',
		seed: 1,
		population: 300,
		days: 7,
		intervention: null,
		aiModel: null,
		status: 'completed',
		config,
		summary: {
			currentRs: 0.5,
			peakRs: 0.9,
			averageRs: 0.5,
			sleepDeprivedPopulation: 10,
			severeSleepDeprivedPopulation: 2,
			totalSleepDebtHours: 100,
			totalSleepLossMinutes: 500,
			cascadeReach: 10,
			cascadeDepth: 2,
			cascadeGeneration: 1,
			accidentCount,
			trafficDelayMinutes: 100,
			overtimeHours,
			averageCommuteDelayMinutes: 5,
			cascadeOccurred: false,
		},
	};
}

describe('buildExperimentReport', () => {
	it('最大・最小の条件を見出しにする', () => {
		const report = buildExperimentReport({
			results: [
				aggregate('baseline', { averageReach: 8 }),
				aggregate('driver-shock', { averageReach: 25 }),
			],
			runs: [],
		});

		expect(report.headline).toContain('driver-shock');
		expect(report.headline).toContain('baseline');
	});

	it('対照条件との差を拡大・抑制で言い分ける', () => {
		const report = buildExperimentReport({
			results: [
				aggregate('none', { averageReach: 20 }),
				aggregate('mandatory-rest', { averageReach: 12 }),
			],
			runs: [],
		});

		expect(
			report.findings.some((line) => line.includes('mandatory-rest') && line.includes('抑制')),
		).toBe(true);
	});

	it('Peak Rs が 1 を超えた条件を自己増殖として挙げる', () => {
		const report = buildExperimentReport({
			results: [aggregate('driver-shock', { peakRs: 1.4 })],
			runs: [],
		});

		expect(report.findings.some((line) => line.includes('自己増殖'))).toBe(true);
	});

	it('ばらつきが大きい条件は結論を保留するよう促す', () => {
		const report = buildExperimentReport({
			results: [aggregate('random-shock', { averageReach: 10, standardDeviation: 8 })],
			runs: [],
		});

		expect(report.cautions.some((line) => line.includes('random-shock'))).toBe(true);
	});

	it('Run があれば条件ごとの副作用を集計する', () => {
		const config = { shockTarget: 'driver', initialSleepDeprivedRate: 0.1 };
		const report = buildExperimentReport({
			results: [aggregate('driver-shock')],
			runs: [run(config, 4, 10), run(config, 6, 20)],
		});

		expect(report.findings.some((line) => line.includes('事故 5.0 件'))).toBe(true);
		expect(report.findings.some((line) => line.includes('残業 15.0 時間'))).toBe(true);
	});

	it('Run が無ければ副作用を比較できないと明示する', () => {
		const report = buildExperimentReport({ results: [aggregate('baseline')], runs: [] });

		expect(report.cautions.some((line) => line.includes('副作用'))).toBe(true);
	});

	it('集計が無ければ分析できないと返す', () => {
		const report = buildExperimentReport({ results: [], runs: [] });

		expect(report.headline).toContain('分析できません');
		expect(report.findings).toEqual([]);
	});
});
