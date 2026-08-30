import type { CascadeThresholds, ExperimentConfigParams } from './experiment-config.model';
import { DEFAULT_CASCADE_THRESHOLDS, ExperimentConfig } from './experiment-config.model';

/**
 * Batch 実行できる実験の種別。
 * スクリプトとブラウザ実行が同じ条件表を読むよう、条件の定義はこのファイルに 1 本化する。
 */
export const BATCH_EXPERIMENT_KINDS = [
	'shock-comparison',
	'critical-point',
	'intervention',
	'cascade-threshold',
] as const;

export type BatchExperimentKind = (typeof BATCH_EXPERIMENT_KINDS)[number];

export function isBatchExperimentKind(value: unknown): value is BatchExperimentKind {
	return typeof value === 'string' && (BATCH_EXPERIMENT_KINDS as readonly string[]).includes(value);
}

/** Run を回す条件。Experimental Variable 以外は base のまま固定する（要件定義 28 章） */
export interface ExperimentCondition {
	label: string;
	overrides: Partial<ExperimentConfigParams>;
}

/** Run は変えず、Cascade の判定条件だけを変える条件（要件定義 24 章の感度分析） */
export interface JudgementCondition {
	label: string;
	thresholds: CascadeThresholds;
}

/**
 * 実験の実行計画。
 *
 * - `run`: 条件ごとに Run を回して比較する（Shock 比較・Sweep・介入比較）
 * - `judgement`: Run は 1 度だけ回し、同じ Run を判定条件だけ変えて数え直す
 *
 * Cascade の判定条件（`cascadeThresholds`）は Simulation の挙動には一切影響せず、
 * CascadeService の評価にしか使われない。条件ごとに回し直すと同じ Run を
 * 何度も計算するだけなので、判定を変える実験は Run を共有する。
 */
export type ExperimentPlan =
	| { kind: BatchExperimentKind; mode: 'run'; conditions: readonly ExperimentCondition[] }
	| { kind: BatchExperimentKind; mode: 'judgement'; conditions: readonly JudgementCondition[] };

/** Batch 実行の基準条件。比較実験ではここから Experimental Variable だけを差し替える */
export const DEFAULT_BATCH_BASE: ExperimentConfigParams = {
	seed: 0,
	population: 300,
	days: 7,
	initialSleepDeprivedRate: 0.1,
	shockTarget: 'driver',
};

/** Critical Point Explorer が振る初期睡眠不足率（要件定義 30 章） */
const CRITICAL_POINT_RATES = [0.01, 0.03, 0.05, 0.07, 0.1, 0.15, 0.2];

/**
 * Cascade 判定の感度分析で比べる判定条件（要件定義 24 章）。
 *
 * 既定の判定（Rs > 1 が 2 世代継続 かつ Reach ≥ 10%）では Cascade 発生率が常に 0 になる。
 * Generation 0 → 1 は爆発的に広がる一方 Generation 1 → 2 で急速に減衰するためで、
 * 「一度大きく広がって収束する」形を判定が拾えていない。
 * 判定式そのものは変えず、どの条件なら Cascade と呼べるのかを結果として示す。
 */
const JUDGEMENT_THRESHOLDS: readonly CascadeThresholds[] = [
	DEFAULT_CASCADE_THRESHOLDS,
	{ rsThreshold: 1, minGenerations: 1, minReachRate: 0.1 },
	{ rsThreshold: 0.75, minGenerations: 1, minReachRate: 0.1 },
	{ rsThreshold: 0.5, minGenerations: 1, minReachRate: 0.1 },
	{ rsThreshold: 0.5, minGenerations: 1, minReachRate: 0.05 },
	{ rsThreshold: 0.25, minGenerations: 2, minReachRate: 0.1 },
];

/** 判定条件をそのまま読める 1 行のラベルにする。比較表の行見出しになる */
export function judgementLabel(thresholds: CascadeThresholds): string {
	const reachPercent = Math.round(thresholds.minReachRate * 100);
	return `Rs>${thresholds.rsThreshold} x${thresholds.minGenerations}世代 / Reach>=${reachPercent}%`;
}

/** 実験種別ごとの実行計画。条件の並びは比較表の行順になる */
export function experimentPlanOf(kind: BatchExperimentKind): ExperimentPlan {
	switch (kind) {
		case 'shock-comparison':
			return {
				kind,
				mode: 'run',
				conditions: [
					{ label: 'baseline', overrides: { shockTarget: 'none', initialSleepDeprivedRate: 0 } },
					{ label: 'random-shock', overrides: { shockTarget: 'random' } },
					{ label: 'driver-shock', overrides: { shockTarget: 'driver' } },
					{ label: 'manager-shock', overrides: { shockTarget: 'manager' } },
				],
			};
		case 'critical-point':
			return {
				kind,
				mode: 'run',
				conditions: CRITICAL_POINT_RATES.map((rate) => ({
					label: `initial-rate-${Math.round(rate * 100)}%`,
					overrides: { initialSleepDeprivedRate: rate },
				})),
			};
		case 'intervention':
			return {
				kind,
				mode: 'run',
				conditions: [
					{ label: 'none', overrides: { intervention: null } },
					{ label: 'mandatory-rest', overrides: { intervention: 'mandatory_rest' } },
					{ label: 'overtime-limit', overrides: { intervention: 'overtime_limit' } },
					{ label: 'flexible-work', overrides: { intervention: 'flexible_work' } },
					{ label: 'remote-work', overrides: { intervention: 'remote_work' } },
				],
			};
		case 'cascade-threshold':
			return {
				kind,
				mode: 'judgement',
				conditions: JUDGEMENT_THRESHOLDS.map((thresholds) => ({
					label: judgementLabel(thresholds),
					thresholds,
				})),
			};
	}
}

/**
 * 判定条件だけを振る実験か。
 * この実験は同じ Run を数え直すため、条件間で Reach や副作用に差が出ない。
 * 画面はこの区別を使って、差が無いものを差として語らないようにする。
 */
export function isJudgementExperimentKind(kind: string): boolean {
	return isBatchExperimentKind(kind) && experimentPlanOf(kind).mode === 'judgement';
}

/** 実行する Run の総数。進捗表示と実行前の見積もりに使う */
export function totalRunCount(plan: ExperimentPlan, seeds: number): number {
	// judgement は同じ Run を判定だけ変えて数え直すため、Run 数は Seed 数のまま増えない
	return plan.mode === 'judgement' ? seeds : plan.conditions.length * seeds;
}

/**
 * ブラウザ実行で許す Seed 数の上限。
 * Run はメインスレッドで回るため、上限が無いと 1 回の実行が数分単位で伸びる。
 * それ以上の規模は `scripts/run-experiment.ts` の担当（要件定義 40 章）。
 */
export const MAX_BROWSER_BATCH_SEEDS = 20;

/** 条件ラベルの最大数。保存を受け付ける集計の件数もこの値で揃える */
export const MAX_SNAPSHOT_CONDITIONS = 64;
/** 条件ラベルの最大長。比較表の 1 行に収まる長さで足りる */
export const MAX_CONDITION_LABEL_LENGTH = 120;

/**
 * ブラウザ実行が保存する条件スナップショット。
 * 後から「何を固定して何を振ったか」を読めるようにするために残す。
 */
export interface BatchExperimentSnapshot {
	base: ExperimentConfigParams;
	seeds: number;
	conditions: string[];
	executedIn: 'browser';
}

/**
 * 保存してよい条件スナップショットかを判定する。
 *
 * Server Action は誰でも呼べるため、`config` を素通しにすると任意の JSON が
 * そのまま `experiments.config_json` へ入る。base は実際に Run を回せる条件か
 * どうかまで確かめ、形だけ整えた偽の実験行が画面へ並ばないようにする。
 */
export function isBatchExperimentSnapshot(value: unknown): value is BatchExperimentSnapshot {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as Partial<BatchExperimentSnapshot>;
	if (candidate.executedIn !== 'browser') {
		return false;
	}
	if (
		!Number.isInteger(candidate.seeds) ||
		(candidate.seeds as number) < 1 ||
		(candidate.seeds as number) > MAX_BROWSER_BATCH_SEEDS
	) {
		return false;
	}
	if (
		!Array.isArray(candidate.conditions) ||
		candidate.conditions.length === 0 ||
		candidate.conditions.length > MAX_SNAPSHOT_CONDITIONS ||
		!candidate.conditions.every(
			(label) =>
				typeof label === 'string' && label.length > 0 && label.length <= MAX_CONDITION_LABEL_LENGTH,
		)
	) {
		return false;
	}
	if (typeof candidate.base !== 'object' || candidate.base === null) {
		return false;
	}
	// 実際に Run を回せる条件かどうかは ExperimentConfig の検証に委ねる
	return ExperimentConfig.create(candidate.base).success;
}
