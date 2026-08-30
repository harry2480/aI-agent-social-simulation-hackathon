import { MAX_CONDITION_LABEL_LENGTH } from './experiment-plan.model';
import type { RunSummary } from './metrics.model';

/**
 * 条件 1 つ分の集計結果（要件定義 39 章）。Experiment の 1 行として保存する。
 *
 * Batch Runner（スクリプト）とブラウザ実行はどちらも「条件を変えて複数 Seed 回し、
 * RunSummary の集合を 1 行へまとめる」という同じ処理を行う。片方だけ指標を足すと
 * 比較表の列が実験の実行経路によって欠けるため、集計は必ずここを通す。
 */
export interface ConditionAggregate {
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
export function aggregateSummaries(
	label: string,
	summaries: readonly RunSummary[],
): ConditionAggregate {
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

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 集計 1 行として保存してよい形かを判定する。
 *
 * ブラウザ実行の結果は Server Action 経由でクライアントから届くため、
 * そのまま保存すると NaN や欠けた項目が比較表に出るまで気づけない。
 */
export function isConditionAggregate(value: unknown): value is ConditionAggregate {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.label !== 'string' || candidate.label.length === 0) {
		return false;
	}
	if (!Number.isInteger(candidate.runCount) || (candidate.runCount as number) < 1) {
		return false;
	}
	if (
		candidate.averageDampingGeneration !== null &&
		!isFiniteNumber(candidate.averageDampingGeneration)
	) {
		return false;
	}

	const numericKeys = [
		'cascadeProbability',
		'outbreakProbability',
		'averageRs',
		'peakRs',
		'averageReach',
		'totalSleepLossMinutes',
		'standardDeviation',
		'averageSleepDebtHours',
		'averageCascadeDepth',
		'averageAccidentCount',
		'averageOvertimeHours',
		'averageCommuteDelayMinutes',
	];
	return numericKeys.every((key) => isFiniteNumber(candidate[key]));
}

/**
 * 検証を通った集計から、保存してよい項目だけを組み立て直す。
 *
 * 型ガードは必須キーの有無しか見ないため、そのまま保存すると
 * 呼び出し側が付けた任意のキーが `aggregate_json` へ入る。
 * ここで既知のキーだけを写し、ラベルの長さも切り詰める。
 */
export function normalizeConditionAggregate(aggregate: ConditionAggregate): ConditionAggregate {
	return {
		label: aggregate.label.slice(0, MAX_CONDITION_LABEL_LENGTH),
		runCount: aggregate.runCount,
		cascadeProbability: aggregate.cascadeProbability,
		outbreakProbability: aggregate.outbreakProbability,
		averageDampingGeneration: aggregate.averageDampingGeneration,
		averageRs: aggregate.averageRs,
		peakRs: aggregate.peakRs,
		averageReach: aggregate.averageReach,
		totalSleepLossMinutes: aggregate.totalSleepLossMinutes,
		standardDeviation: aggregate.standardDeviation,
		averageSleepDebtHours: aggregate.averageSleepDebtHours,
		averageCascadeDepth: aggregate.averageCascadeDepth,
		averageAccidentCount: aggregate.averageAccidentCount,
		averageOvertimeHours: aggregate.averageOvertimeHours,
		averageCommuteDelayMinutes: aggregate.averageCommuteDelayMinutes,
	};
}
