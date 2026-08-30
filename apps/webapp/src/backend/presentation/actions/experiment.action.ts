'use server';

import { revalidatePath } from 'next/cache';
import {
	type ConditionAggregate,
	experimentRepository,
	isBatchExperimentKind,
	isConditionAggregate,
} from '../composition/simulation.composition';

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

export interface SaveExperimentInput {
	name: string;
	kind: string;
	/** 実験条件のスナップショット。base 条件・Seed 数・条件の一覧を入れる */
	config: unknown;
	/** 条件ごとの集計。ブラウザで実行した結果がここへ届く */
	results: unknown;
}

/**
 * ブラウザで実行した Batch 実験の結果を保存する（要件定義 26・30・32 章）。
 *
 * Run 単位（Agent / Event / Metrics）は保存しない。Run 数に比例して送信量が膨らむうえ、
 * 比較表・Critical Point・自動レポートはどれも条件ごとの集計だけで描けるため。
 * Run 単位の時系列まで要る場合は `scripts/run-experiment.ts` を使う。
 *
 * Server Action はクライアントから直接呼べるため、集計の形はここで必ず検証する。
 * NaN や欠けた項目をそのまま保存すると、比較表に出るまで壊れたことに気づけない。
 */
export async function saveExperimentAction(
	input: SaveExperimentInput,
): Promise<{ experimentId: string }> {
	if (input.name.trim().length === 0) {
		throw new Error('実験名を入力してください');
	}
	if (!isBatchExperimentKind(input.kind)) {
		throw new Error(`unknown experiment kind: ${input.kind}`);
	}
	if (!Array.isArray(input.results) || input.results.length === 0) {
		throw new Error('保存する集計がありません');
	}
	const results: ConditionAggregate[] = input.results.map((result) => {
		if (!isConditionAggregate(result)) {
			throw new Error('集計の形式が不正です');
		}
		return result;
	});

	const experimentId = await experimentRepository.create({
		name: input.name,
		kind: input.kind,
		config: input.config,
	});
	await experimentRepository.saveResults(
		experimentId,
		results.map((result) => ({ ...result, aggregate: result })),
	);

	// 実験一覧と、その結果を読む各 Explorer の表示を更新する
	revalidatePath('/experiments');
	revalidatePath('/critical-point');

	return { experimentId };
}
