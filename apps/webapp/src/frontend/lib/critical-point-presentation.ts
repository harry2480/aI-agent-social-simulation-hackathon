import type { ExperimentAggregate } from '@/backend/presentation/composition/simulation.composition';

export interface CriticalPointSample {
	/** 初期睡眠不足率（0〜1） */
	initialRate: number;
	cascadeProbability: number;
	averageReach: number;
	averageRs: number;
	standardDeviation: number;
	runCount: number;
}

export interface CriticalPointRange {
	/** Cascade Probability が 50% を下回っていた直前の初期率 */
	lowerRate: number | null;
	/** はじめて 50% 以上になった初期率 */
	upperRate: number;
}

/** Cascade が自己増殖し始めたとみなす確率（要件定義 30 章） */
export const CRITICAL_CASCADE_PROBABILITY = 0.5;

/** Batch Runner が付ける `initial-rate-5%` 形式のラベルから初期率を取り出す */
export function parseInitialRateLabel(label: string): number | null {
	const matched = /^initial-rate-(\d+(?:\.\d+)?)%$/.exec(label);
	if (matched === null) {
		return null;
	}
	return Number(matched[1]) / 100;
}

/**
 * Sweep 結果を初期率の昇順に並べた系列へ変換する。
 * ラベルを解釈できない条件は Sweep の対象外なので除外する。
 */
export function toCriticalPointSeries(
	results: readonly ExperimentAggregate[],
): CriticalPointSample[] {
	const samples: CriticalPointSample[] = [];
	for (const result of results) {
		const initialRate = parseInitialRateLabel(result.label);
		if (initialRate === null) {
			continue;
		}
		samples.push({
			initialRate,
			cascadeProbability: result.cascadeProbability,
			averageReach: result.averageReach,
			averageRs: result.averageRs,
			standardDeviation: result.standardDeviation,
			runCount: result.runCount,
		});
	}
	return samples.sort((a, b) => a.initialRate - b.initialRate);
}

/**
 * 臨界点候補を求める。
 * Cascade Probability がはじめて 50% 以上になった点と、その直前の点で挟む。
 * 「この 2 点の間に臨界点がある」以上のことは Sweep の粒度からは言えない。
 */
export function findCriticalPointRange(
	samples: readonly CriticalPointSample[],
): CriticalPointRange | null {
	for (const [index, sample] of samples.entries()) {
		if (sample.cascadeProbability >= CRITICAL_CASCADE_PROBABILITY) {
			return {
				lowerRate: index === 0 ? null : (samples[index - 1]?.initialRate ?? null),
				upperRate: sample.initialRate,
			};
		}
	}
	return null;
}
