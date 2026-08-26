import type { CreateSimulationInput } from '@/backend/presentation/actions/simulation.action';
import { TICKS_PER_DAY } from '@/backend/presentation/composition/watch-mode-engine.composition';

/**
 * このエンドポイントで同期実行を許す規模の上限（Agent × Tick）。
 *
 * 標準条件の Population 300・7 日ぶんがちょうど上限になる。
 * これを超える Batch（Multi-seed / Sweep）は Vercel Function の実行時間上限に当たるため、
 * ローカルの `scripts/run-experiment.ts` が担う（要件定義 41 章）。
 */
export const MAX_SYNCHRONOUS_AGENT_TICKS = 300 * 7 * TICKS_PER_DAY;

/**
 * Run 実行リクエストの形を確認する。
 * ExperimentConfig.create が値の範囲を見るため、ここでは型だけを確かめる。
 */
export function isCreateSimulationInput(value: unknown): value is CreateSimulationInput {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as Partial<CreateSimulationInput>;
	return (
		typeof candidate.seed === 'number' &&
		typeof candidate.population === 'number' &&
		typeof candidate.days === 'number' &&
		typeof candidate.initialSleepDeprivedRate === 'number'
	);
}

/** 同期実行には大きすぎる Run か */
export function exceedsSynchronousLimit(input: {
	population: number;
	days: number;
}): boolean {
	return input.population * input.days * TICKS_PER_DAY > MAX_SYNCHRONOUS_AGENT_TICKS;
}

export type RunDetailLevel = 'summary' | 'full';

/**
 * Run 取得の粒度を解釈する。指定が無ければ `summary`。
 *
 * `full` は Agent / Event / Causal Edge / Decision / Metrics まで返すが、
 * 500 Agent × 14 日の Run では Event が 10 万件規模になりレスポンスが肥大するため、
 * 明示されたときだけ返す。解釈できない値は既定へ倒さず呼び出し側へ知らせる（null）。
 */
export function parseRunDetailLevel(raw: string | null): RunDetailLevel | null {
	if (raw === null) {
		return 'summary';
	}
	return raw === 'summary' || raw === 'full' ? raw : null;
}
