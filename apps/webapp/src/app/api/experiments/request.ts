import type { CreateExperimentInput } from '@/backend/presentation/actions/experiment.action';
import { isExperimentKind } from '@/backend/presentation/composition/simulation.composition';

/**
 * 実験登録リクエストの形を確認する。
 *
 * kind は画面が読む種別（`EXPERIMENT_KINDS`）に限る。
 * それ以外で登録すると、どの画面からも参照されない実験行が残るため。
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
		isExperimentKind(candidate.kind) &&
		'config' in candidate
	);
}
