import type {
	BatchExperimentKind,
	ConditionAggregate,
	ExperimentConfigParams,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import {
	DEFAULT_BATCH_BASE,
	MAX_DAYS,
	MAX_POPULATION,
	experimentPlanOf,
	isBatchExperimentKind,
	totalRunCount,
} from '@/backend/presentation/composition/watch-mode-engine.composition';

/**
 * ブラウザ実行で許す Seed 数の上限。
 * Run はメインスレッドで回るため、上限が無いと 1 回の実行が数分単位で伸びる。
 * それ以上の規模は `scripts/run-experiment.ts` の担当（要件定義 40 章）。
 */
export const MAX_BATCH_SEEDS = 20;

export type { BatchExperimentKind };

export interface BatchFormState {
	kind: BatchExperimentKind;
	population: number;
	days: number;
	seeds: number;
}

export const DEFAULT_BATCH_FORM: BatchFormState = {
	kind: 'shock-comparison',
	population: DEFAULT_BATCH_BASE.population,
	days: DEFAULT_BATCH_BASE.days,
	seeds: 5,
};

export const BATCH_KIND_LABELS: Record<BatchExperimentKind, string> = {
	'shock-comparison': 'Shock 比較（Baseline / Random / Driver / Manager）',
	'critical-point': 'Critical Point Sweep（初期睡眠不足率 1〜20%）',
	intervention: 'Intervention 比較（介入 4 種 + 対照）',
	'cascade-threshold': 'Cascade 判定の感度分析（同一 Run を判定条件だけ変えて数え直す）',
};

/** 実行計画。フォームの検証を通った値だけがここへ入る */
export interface BatchPlan {
	kind: BatchExperimentKind;
	seeds: number;
	base: ExperimentConfigParams;
	/** 実行する Run の総数。実行前の見積もりと進捗の分母になる */
	totalRuns: number;
	conditionCount: number;
}

export type BatchFormResult = { plan: BatchPlan } | { error: string };

/**
 * フォームの入力を実行計画へ変換する。
 *
 * Population / Days は ExperimentConfig と同じ上限で弾く。Run を回し始めてから
 * 1 本目で例外になると、それまでの待ち時間が無駄になる。
 */
export function parseBatchForm(form: BatchFormState): BatchFormResult {
	if (!isBatchExperimentKind(form.kind)) {
		return { error: '実験の種類を選んでください' };
	}
	if (
		!Number.isInteger(form.population) ||
		form.population < 1 ||
		form.population > MAX_POPULATION
	) {
		return { error: `Population は 1〜${MAX_POPULATION} の整数で指定してください` };
	}
	if (!Number.isInteger(form.days) || form.days < 1 || form.days > MAX_DAYS) {
		return { error: `Days は 1〜${MAX_DAYS} の整数で指定してください` };
	}
	if (!Number.isInteger(form.seeds) || form.seeds < 1 || form.seeds > MAX_BATCH_SEEDS) {
		return { error: `Seed 数は 1〜${MAX_BATCH_SEEDS} の整数で指定してください` };
	}

	const plan = experimentPlanOf(form.kind);
	return {
		plan: {
			kind: form.kind,
			seeds: form.seeds,
			base: { ...DEFAULT_BATCH_BASE, population: form.population, days: form.days },
			totalRuns: totalRunCount(plan, form.seeds),
			conditionCount: plan.conditions.length,
		},
	};
}

/** 保存する実験名。スクリプトが付ける名前と同じ形にして、一覧で見分けられるようにする */
export function batchExperimentName(kind: BatchExperimentKind, seeds: number): string {
	return `${kind} (${seeds} seeds, browser)`;
}

/** 保存する条件スナップショット。後から「何を固定して何を振ったか」を読めるようにする */
export function batchExperimentConfig(plan: BatchPlan): {
	base: ExperimentConfigParams;
	seeds: number;
	conditions: string[];
	executedIn: 'browser';
} {
	return {
		base: plan.base,
		seeds: plan.seeds,
		conditions: experimentPlanOf(plan.kind).conditions.map((condition) => condition.label),
		executedIn: 'browser',
	};
}

/** 進捗バーの値（0〜100）。総数が 0 のときは 0 にする */
export function batchProgressPercent(done: number, total: number): number {
	if (total <= 0) {
		return 0;
	}
	return Math.min(100, Math.round((done / total) * 100));
}

/**
 * 集計を比較表が読む形へ変換する。
 * 保存時と同じく集計そのものを aggregate へ入れ、保存前後で表示が変わらないようにする。
 */
export function toComparisonResults(aggregates: readonly ConditionAggregate[]) {
	return aggregates.map((aggregate) => ({ ...aggregate, aggregate }));
}
