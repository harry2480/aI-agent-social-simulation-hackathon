'use client';

import { saveExperimentAction } from '@/backend/presentation/actions/experiment.action';
import {
	type BatchProgress,
	type ConditionAggregate,
	createBrowserBatchExperimentUseCase,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import {
	type BatchPlan,
	batchExperimentConfig,
	batchExperimentName,
} from '@/frontend/lib/experiment-batch';
import { useCallback, useRef, useState } from 'react';

export type BatchStatus = 'idle' | 'running' | 'saving' | 'done' | 'error';

/** 中止は例外で Run のループを抜ける。UseCase 側に中止の概念を持ち込まないため */
const CANCELLED = 'BATCH_CANCELLED';

/** 描画へ制御を返す。Run はメインスレッドで回るため、これが無いと進捗が出ない */
function yieldToPaint(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Batch 実験をブラウザで実行する（要件定義 26・30・32・40 章）。
 *
 * Multi-seed / Sweep は Vercel Function の実行時間上限に当たるためサーバーでは完走できない。
 * Experiment Mode は Rule-based 固定で外部 API を呼ばないため、Watch Mode と同じく
 * ブラウザで回し、結果の集計だけを Server Action で保存する。
 */
export function useExperimentBatch(databaseConfigured: boolean) {
	const [status, setStatus] = useState<BatchStatus>('idle');
	const [progress, setProgress] = useState<BatchProgress>({ done: 0, total: 0, label: '' });
	const [results, setResults] = useState<ConditionAggregate[]>([]);
	const [experimentId, setExperimentId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const cancelledRef = useRef(false);

	const cancel = useCallback(() => {
		cancelledRef.current = true;
	}, []);

	const run = useCallback(
		async (plan: BatchPlan) => {
			cancelledRef.current = false;
			setStatus('running');
			setError(null);
			setResults([]);
			setExperimentId(null);
			setProgress({ done: 0, total: plan.totalRuns, label: '' });
			// 1 本目の Run が始まる前に、実行中の表示を描かせる
			await yieldToPaint();

			try {
				const aggregates = await createBrowserBatchExperimentUseCase().execute({
					kind: plan.kind,
					seeds: plan.seeds,
					base: plan.base,
					onProgress: async (current) => {
						if (cancelledRef.current) {
							throw new Error(CANCELLED);
						}
						setProgress(current);
						await yieldToPaint();
					},
				});
				setResults(aggregates);

				// DB が無い環境では保存できないが、集計はその場で読めるようにする
				if (!databaseConfigured) {
					setStatus('done');
					return;
				}

				setStatus('saving');
				const saved = await saveExperimentAction({
					name: batchExperimentName(plan.kind, plan.seeds),
					kind: plan.kind,
					config: batchExperimentConfig(plan),
					results: aggregates,
				});
				setExperimentId(saved.experimentId);
				setStatus('done');
			} catch (thrown) {
				if (thrown instanceof Error && thrown.message === CANCELLED) {
					setStatus('idle');
					return;
				}
				setError(thrown instanceof Error ? thrown.message : '実験の実行に失敗しました');
				setStatus('error');
			}
		},
		[databaseConfigured],
	);

	return { status, progress, results, experimentId, error, run, cancel };
}
