/**
 * Batch Runner スクリプトが共有する CLI ヘルパー。
 *
 * 集計そのもの（`aggregateSummaries` など）は
 * `src/backend/domain/models/experiment-aggregate.model.ts` にある。
 * スクリプトとブラウザ実行が同じ集計を使うため、domain 側に置いている。
 */
import type { ConditionAggregate } from '../../src/backend/domain/models/experiment-aggregate.model';

/**
 * `--name=value` 形式の引数を読む。
 * 値に `=` が含まれても切り詰めないよう、分割ではなく接頭辞の長さで切る。
 */
export function argValue(argv: readonly string[], name: string): string | undefined {
	const prefix = `--${name}=`;
	return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

/**
 * Seed 数を読み取る。
 * 不正値のまま進むと Run が 1 本も回らず、NaN や -Infinity の集計が DB へ保存される。
 */
export function parseSeeds(raw: string | undefined, fallback: number): number {
	if (raw === undefined) {
		return fallback;
	}
	const seeds = Number(raw);
	if (!Number.isInteger(seeds) || seeds < 1) {
		throw new Error('--seeds には 1 以上の整数を指定してください');
	}
	return seeds;
}

/** 集計 1 行の 1 行ログ。実験の種類によらず同じ列で読めるようにする */
export function formatAggregateLine(aggregate: ConditionAggregate, labelWidth: number): string {
	return (
		`  ${aggregate.label.padEnd(labelWidth)} reach=${aggregate.averageReach.toFixed(1)} ` +
		`sd=${aggregate.standardDeviation.toFixed(1)} avgRs=${aggregate.averageRs.toFixed(2)} ` +
		`peakRs=${aggregate.peakRs.toFixed(2)} cascadeP=${(aggregate.cascadeProbability * 100).toFixed(0)}% ` +
		`outbreakP=${(aggregate.outbreakProbability * 100).toFixed(0)}%`
	);
}
