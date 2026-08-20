import type {
	ExperimentAggregate,
	StoredRun,
} from '@/backend/presentation/composition/simulation.composition';
import {
	type ComparisonRow,
	describeRunCondition,
	formatPercent,
	toComparisonRows,
} from './experiment-presentation';

/** 実験 1 件分の分析レポート */
export interface ExperimentReport {
	/** 実験全体の要約 1 行 */
	headline: string;
	/** 読み取れた事実 */
	findings: string[];
	/** 結論を出す前に注意すべき点 */
	cautions: string[];
}

/**
 * Seed 間のばらつきが大きいと判断する基準。
 * 標準偏差が平均の半分を超える条件は、Seed を増やさずに差を結論できない。
 */
const HIGH_VARIANCE_RATIO = 0.5;

/** Rs がこの値を超えると睡眠不足が自己増殖している（要件定義 24 章） */
const SELF_REPLICATION_RS = 1;

function formatNumber(value: number, digits = 1): string {
	return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

/**
 * 集計結果から分析レポートを組み立てる。
 *
 * AI には推論させず、保存された数値だけから決定論的に生成する。
 * 同じ実験からは常に同じレポートが出る必要があるため（要件定義 44 章の再現性）。
 */
export function buildExperimentReport(params: {
	results: readonly ExperimentAggregate[];
	runs: readonly StoredRun[];
}): ExperimentReport {
	const rows = toComparisonRows(params.results);
	if (rows.length === 0) {
		return {
			headline: '集計結果がないため分析できません。',
			findings: [],
			cautions: [],
		};
	}

	const findings: string[] = [];
	const cautions: string[] = [];

	const sortedByReach = [...rows].sort((a, b) => b.averageReach - a.averageReach);
	const worst = sortedByReach[0];
	const best = sortedByReach[sortedByReach.length - 1];

	const headline =
		worst === undefined || best === undefined || worst.label === best.label
			? `${rows.length} 条件を比較しました。`
			: `Cascade Reach が最大だったのは ${worst.label}（平均 ${formatNumber(worst.averageReach)}）、最小は ${best.label}（平均 ${formatNumber(best.averageReach)}）です。`;

	for (const row of rows) {
		if (row.reachDeltaVsControl === null) {
			continue;
		}
		const direction = row.reachDeltaVsControl > 0 ? '拡大' : '抑制';
		findings.push(
			`${row.label} は対照条件に対して Cascade Reach を ${formatNumber(Math.abs(row.reachDeltaVsControl))} 人分 ${direction}しました（Cascade 発生率 ${formatPercent(row.cascadeProbability)}）。`,
		);
	}

	findings.push(...summarizeOutbreakShape(rows));

	const selfReplicating = rows.filter((row) => row.peakRs > SELF_REPLICATION_RS);
	if (selfReplicating.length > 0) {
		findings.push(
			`Peak Rs が 1 を超えた条件: ${selfReplicating.map((row) => `${row.label}（${formatNumber(row.peakRs, 2)}）`).join('、')}。この条件では睡眠不足が自己増殖しています。`,
		);
	} else {
		findings.push('どの条件でも Peak Rs は 1 以下で、自己増殖には至っていません。');
	}

	for (const row of rows) {
		if (row.averageReach > 0 && row.standardDeviation / row.averageReach > HIGH_VARIANCE_RATIO) {
			cautions.push(
				`${row.label} は Seed 間のばらつきが大きく（平均 ${formatNumber(row.averageReach)} / SD ${formatNumber(row.standardDeviation)}）、${row.runCount} Seed では差を結論できません。`,
			);
		}
	}

	const sideEffects = summarizeSideEffects(params.runs);
	findings.push(...sideEffects);
	if (params.runs.length === 0) {
		cautions.push(
			'Run が保存されていないため、事故件数・残業時間などの副作用は比較できません（Batch Runner を --save-runs=false で実行した場合に起こります）。',
		);
	}

	return { headline, findings, cautions };
}

/**
 * Cascade 判定（24 章）と Outbreak 発生率のズレを言語化する。
 *
 * 判定は Rs > 1 が 2 世代続くことを求めるが、実測の Cascade は
 * 「一度大きく広がって収束する」形を取り、Generation 1 → 2 で減衰して判定が成立しない。
 * 発生率 0% だけを見て「広がらなかった」と読み違えないための所見。
 */
function summarizeOutbreakShape(rows: readonly ComparisonRow[]): string[] {
	const measured = rows.filter((row) => row.outbreakProbability !== null);
	if (measured.length === 0) {
		return [];
	}

	const diverged = measured.filter(
		(row) => row.cascadeProbability === 0 && (row.outbreakProbability ?? 0) > 0,
	);
	if (diverged.length === 0) {
		return [];
	}

	const damped = diverged.filter((row) => row.averageDampingGeneration !== null);
	const dampingNote =
		damped.length === 0
			? ''
			: `収束が始まる世代は平均 G${formatNumber(
					damped.reduce((sum, row) => sum + (row.averageDampingGeneration ?? 0), 0) / damped.length,
				)} です。`;

	return [
		`${diverged.map((row) => `${row.label}（Outbreak ${formatPercent(row.outbreakProbability ?? 0)}）`).join('、')} は Cascade 発生率 0% ですが、Reach は閾値へ達しています。Rs > 1 が 2 世代続かないため 24 章の判定は成立せず、一度大きく広がって収束する形になっています。${dampingNote}`,
	];
}

/**
 * 条件ごとの副作用（事故件数・残業時間）を比較する。
 * 介入は Cascade を抑えても事故や残業を増やすことがあるため、効果と併せて見る（要件定義 29 章）。
 */
function summarizeSideEffects(runs: readonly StoredRun[]): string[] {
	const byCondition = new Map<string, { accidents: number[]; overtime: number[] }>();
	for (const run of runs) {
		if (run.summary === null) {
			continue;
		}
		const key = describeRunCondition(run.config);
		const bucket = byCondition.get(key) ?? { accidents: [], overtime: [] };
		bucket.accidents.push(run.summary.accidentCount);
		bucket.overtime.push(run.summary.overtimeHours);
		byCondition.set(key, bucket);
	}

	const findings: string[] = [];
	for (const [condition, values] of byCondition) {
		const average = (list: number[]): number =>
			list.reduce((sum, value) => sum + value, 0) / list.length;
		findings.push(
			`${condition}: 平均 事故 ${formatNumber(average(values.accidents))} 件 / 残業 ${formatNumber(average(values.overtime))} 時間（${values.accidents.length} Run）。`,
		);
	}
	return findings;
}
