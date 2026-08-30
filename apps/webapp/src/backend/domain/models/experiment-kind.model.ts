/**
 * 実験の種別。どの探索が生成した結果かを表し、画面はこの値で読む実験を選ぶ。
 *
 * ここに無い kind で保存された実験行は、どの画面からも参照されないまま残る。
 * 定義をこの 1 箇所に置き、登録 API・スクリプト・画面が同じ一覧を参照する。
 */
export const EXPERIMENT_KINDS = [
	'shock-comparison',
	'critical-point',
	'intervention',
	'super-spreader',
	'cascade-threshold',
	'ai-model-comparison',
] as const;

export type ExperimentKind = (typeof EXPERIMENT_KINDS)[number];

export function isExperimentKind(value: unknown): value is ExperimentKind {
	return typeof value === 'string' && (EXPERIMENT_KINDS as readonly string[]).includes(value);
}
