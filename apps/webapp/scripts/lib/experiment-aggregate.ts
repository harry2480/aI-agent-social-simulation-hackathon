/**
 * Batch Runner が共有する集計ロジック。
 *
 * run-experiment.ts と compare-ai-models.ts は「条件を変えて複数 Seed 回し、
 * RunSummary の集合を 1 行へまとめる」という同じ処理を行う。
 * 片方だけ指標を足すと比較表の列が実験の種類によって欠けるため、ここに 1 本化する。
 */
import type { RunSummary } from '../../src/backend/domain/models/metrics.model';

/** 条件 1 つ分の集計結果。Experiment の 1 行として保存する */
export interface Aggregate {
	label: string;
	runCount: number;
	cascadeProbability: number;
	/** Rs の世代継続を問わず Cascade Reach が閾値へ達した Run の割合（24 章の判定を補う指標） */
	outbreakProbability: number;
	/** Rs が閾値を超えたあと収束し始めた世代の平均。一度も超えなかった場合は null */
	averageDampingGeneration: number | null;
	averageRs: number;
	peakRs: number;
	averageReach: number;
	totalSleepLossMinutes: number;
	standardDeviation: number;
	/**
	 * 介入の副作用まで読むための指標（要件定義 32・39 章）。
	 *
	 * Cascade Reach だけを見ると「残業を止めれば伝播が減る」までしか分からない。
	 * 事故・残業・通勤遅延まで並べて初めて、その介入が何と引き換えかが読める。
	 */
	averageSleepDebtHours: number;
	averageCascadeDepth: number;
	averageAccidentCount: number;
	averageOvertimeHours: number;
	averageCommuteDelayMinutes: number;
}

/**
 * `--name=value` 形式の引数を読む。
 * 値に `=` が含まれても切り詰めないよう、分割ではなく接頭辞の長さで切る。
 */
export function argValue(argv: readonly string[], name: string): string | undefined {
	const prefix = `--${name}=`;
	return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

/**
 * Seed 数を読み取る。
 * 不正値のまま進むと Run が 1 本も回らず、NaN や -Infinity の集計が DB へ保存される。
 */
export function parseSeeds(raw: string | undefined, fallback: number): number {
	if (raw === undefined) {
		return fallback;
	}
	const seeds = Number(raw);
	if (!Number.isInteger(seeds) || seeds < 1) {
		throw new Error('--seeds には 1 以上の整数を指定してください');
	}
	return seeds;
}

/** 母集団としての標準偏差。Seed 間のばらつきを見るため、平均だけでは足りない */
export function standardDeviation(values: readonly number[]): number {
	if (values.length === 0) {
		return 0;
	}
	const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
	const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
	return Math.sqrt(variance);
}

/**
 * Rs が閾値を超えたあと収束し始めた世代の平均。
 * 一度も閾値を超えなかった Run は「収束する山が無かった」ため対象から除く。
 */
export function averageDampingGeneration(summaries: readonly RunSummary[]): number | null {
	const generations = summaries
		.map((summary) => summary.dampingGeneration)
		.filter((generation): generation is number => generation !== null);
	if (generations.length === 0) {
		return null;
	}
	return generations.reduce((sum, value) => sum + value, 0) / generations.length;
}

/**
 * 同一条件の Run 群を 1 行の集計へまとめる。
 *
 * Run が 0 本だと平均が NaN、Peak Rs が -Infinity になったまま DB へ入り、
 * 比較表で初めて気づくことになるため、ここで弾く。
 */
export function aggregateSummaries(label: string, summaries: readonly RunSummary[]): Aggregate {
	if (summaries.length === 0) {
		throw new Error(`aggregateSummaries: 条件 "${label}" の Run が 1 本もありません`);
	}

	const reaches = summaries.map((summary) => summary.cascadeReach);
	const average = (values: readonly number[]): number =>
		values.reduce((sum, value) => sum + value, 0) / values.length;

	return {
		label,
		runCount: summaries.length,
		cascadeProbability:
			summaries.filter((summary) => summary.cascadeOccurred).length / summaries.length,
		outbreakProbability:
			summaries.filter((summary) => summary.outbreakOccurred).length / summaries.length,
		averageDampingGeneration: averageDampingGeneration(summaries),
		averageRs: average(summaries.map((summary) => summary.averageRs)),
		peakRs: Math.max(...summaries.map((summary) => summary.peakRs)),
		averageReach: average(reaches),
		totalSleepLossMinutes: average(summaries.map((summary) => summary.totalSleepLossMinutes)),
		standardDeviation: standardDeviation(reaches),
		averageSleepDebtHours: average(summaries.map((summary) => summary.totalSleepDebtHours)),
		averageCascadeDepth: average(summaries.map((summary) => summary.cascadeDepth)),
		averageAccidentCount: average(summaries.map((summary) => summary.accidentCount)),
		averageOvertimeHours: average(summaries.map((summary) => summary.overtimeHours)),
		averageCommuteDelayMinutes: average(
			summaries.map((summary) => summary.averageCommuteDelayMinutes),
		),
	};
}

/** 集計 1 行の 1 行ログ。実験の種類によらず同じ列で読めるようにする */
export function formatAggregateLine(aggregate: Aggregate, labelWidth: number): string {
	return (
		`  ${aggregate.label.padEnd(labelWidth)} reach=${aggregate.averageReach.toFixed(1)} ` +
		`sd=${aggregate.standardDeviation.toFixed(1)} avgRs=${aggregate.averageRs.toFixed(2)} ` +
		`peakRs=${aggregate.peakRs.toFixed(2)} cascadeP=${(aggregate.cascadeProbability * 100).toFixed(0)}% ` +
		`outbreakP=${(aggregate.outbreakProbability * 100).toFixed(0)}%`
	);
}
