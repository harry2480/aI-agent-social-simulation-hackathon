'use server';

import { revalidatePath } from 'next/cache';
import { experimentRepository } from '../composition/simulation.composition';

export interface CreateExperimentInput {
	name: string;
	kind: string;
	/** 実験条件のスナップショット。後からの設定変更が過去の結果へ影響しないよう実験ごとに持つ */
	config: unknown;
}

/**
 * 実験レコードを登録する（要件定義 41 章）。
 *
 * 登録のみを行い、Run の実行はここでは行わない。
 * Multi-seed / Sweep は Vercel Function の実行時間上限に当たるため、
 * ローカルの `scripts/run-experiment.ts` が実行と結果保存を担う。
 */
export async function createExperimentAction(
	input: CreateExperimentInput,
): Promise<{ experimentId: string }> {
	const experimentId = await experimentRepository.create({
		name: input.name,
		kind: input.kind,
		config: input.config,
	});

	revalidatePath('/experiments');
	return { experimentId };
}
