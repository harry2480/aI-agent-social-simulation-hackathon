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
			outbreakOccurred: false,
			dampingGeneration: null,
		},
	};
}

describe('Cascade 判定と Outbreak のズレ', () => {
	it('発生率 0% でも Reach が閾値へ達していれば所見に出す', () => {
		const report = buildExperimentReport({
			results: [
				aggregate('driver-shock', {
					cascadeProbability: 0,
					aggregate: { outbreakProbability: 1, averageDampingGeneration: 1 },
				}),
			],
			runs: [],
		});

		const finding = report.findings.find((text) => text.includes('Outbreak'));
		expect(finding).toContain('driver-shock');
		expect(finding).toContain('一度大きく広がって収束する');
		expect(finding).toContain('G1.0');
	});

	it('補助指標が無い過去の実験では所見を作らない', () => {
		const report = buildExperimentReport({
			results: [aggregate('driver-shock', { cascadeProbability: 0 })],
			runs: [],
		});

		expect(report.findings.some((text) => text.includes('Outbreak'))).toBe(false);
	});

	it('Cascade 発生率が 0% でなければ所見を作らない', () => {
		const report = buildExperimentReport({
			results: [
				aggregate('driver-shock', {
					cascadeProbability: 0.5,
					aggregate: { outbreakProbability: 1, averageDampingGeneration: 1 },
				}),
			],
			runs: [],
		});

		expect(report.findings.some((text) => text.includes('Outbreak'))).toBe(false);
	});
});

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

	it('summary が無い Run は副作用の集計から除く', () => {
		const config = { shockTarget: 'driver', initialSleepDeprivedRate: 0.1 };
		const incomplete: StoredRun = { ...run(config, 4, 10), summary: null };
		const report = buildExperimentReport({
			results: [aggregate('driver-shock')],
			runs: [incomplete, run(config, 6, 20)],
		});

		// 完了した Run だけを見るので、平均は 6 件・20 時間になる
		expect(report.findings.some((line) => line.includes('事故 6.0 件'))).toBe(true);
		expect(report.findings.some((line) => line.includes('残業 20.0 時間'))).toBe(true);
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

describe('判定条件だけを振った実験', () => {
	/** 同じ Run を数え直すため、Reach は全条件で同じ値になる */
	const judgementResults = [
		aggregate('Rs>1 x2世代 / Reach>=10%', { cascadeProbability: 0, averageReach: 20.8 }),
		aggregate('Rs>0.75 x1世代 / Reach>=10%', { cascadeProbability: 0.2, averageReach: 20.8 }),
		aggregate('Rs>0.5 x1世代 / Reach>=5%', { cascadeProbability: 0.6, averageReach: 20.8 }),
	];

	it('Reach の大小ではなく、判定条件ごとの発生率を見出しにする', () => {
		// 全条件が同じ Run なので「最大 20.8 / 最小 20.8」と書くと差があるように読める
		const report = buildExperimentReport({
			results: judgementResults,
			runs: [],
			kind: 'cascade-threshold',
		});

		expect(report.headline).toContain('3 通りの判定条件で数え直しました');
		expect(report.headline).toContain('0%〜60%');
		expect(report.headline).not.toContain('最大');
	});

	it('対照との差 0 を「抑制しました」と書かない', () => {
		const report = buildExperimentReport({
			results: judgementResults,
			runs: [],
			kind: 'cascade-threshold',
		});

		expect(report.findings.some((finding) => finding.includes('人分'))).toBe(false);
		expect(
			report.findings.some((finding) => finding.includes('判定条件ごとの Cascade 発生率')),
		).toBe(true);
	});

	it('どの判定でも成立しなければ、緩める余地があることを書く', () => {
		const report = buildExperimentReport({
			results: judgementResults.map((result) => ({ ...result, cascadeProbability: 0 })),
			runs: [],
			kind: 'cascade-threshold',
		});

		expect(
			report.findings.some((finding) =>
				finding.includes('どの判定条件でも Cascade は成立しません'),
			),
		).toBe(true);
	});

	it('種別を渡さない実験ではこれまでどおり Reach の大小を出す', () => {
		const report = buildExperimentReport({
			results: [
				aggregate('baseline', { averageReach: 5 }),
				aggregate('driver-shock', { averageReach: 30 }),
			],
			runs: [],
		});

		expect(report.headline).toContain('Cascade Reach が最大だったのは');
	});
});

describe('Run が保存されていないときの注意文', () => {
	it('ブラウザ実行では実行方法ではなく実行経路を理由にする', () => {
		// ブラウザ実行は設計上 Run 単位を保存しない。--save-runs=false を案内すると誤解を招く
		const report = buildExperimentReport({
			results: [aggregate('baseline')],
			runs: [],
			kind: 'shock-comparison',
			config: { executedIn: 'browser' },
		});

		expect(
			report.cautions.some((caution) => caution.includes('ブラウザ実行は条件ごとの集計だけ')),
		).toBe(true);
		expect(report.cautions.some((caution) => caution.includes('--save-runs=false'))).toBe(false);
	});

	it('スクリプト実行では従来どおり --save-runs=false を案内する', () => {
		const report = buildExperimentReport({ results: [aggregate('baseline')], runs: [] });

		expect(report.cautions.some((caution) => caution.includes('--save-runs=false'))).toBe(true);
	});
});
