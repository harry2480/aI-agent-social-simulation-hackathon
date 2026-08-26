import type { CreateExperimentInput } from '@/backend/presentation/actions/experiment.action';

/**
 * 画面とスクリプトが読む実験の種別。
 * ここに無い kind で登録するとどの画面からも参照できない行になるため、登録時に弾く。
 */
export const EXPERIMENT_KINDS = [
	'shock-comparison',
	'critical-point',
	'intervention',
	'super-spreader',
	'ai-model-comparison',
] as const;

/**
 * 実験登録リクエストの形を確認する。
 * config は実験ごとに形が異なるスナップショットなので、存在だけを見て中身は検証しない。
 */
export function isCreateExperimentInput(value: unknown): value is CreateExperimentInput {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	const candidate = value as Partial<CreateExperimentInput>;
	return (
		typeof candidate.name === 'string' &&
		candidate.name.length > 0 &&
		typeof candidate.kind === 'string' &&
		(EXPERIMENT_KINDS as readonly string[]).includes(candidate.kind) &&
		'config' in candidate
	);
}
