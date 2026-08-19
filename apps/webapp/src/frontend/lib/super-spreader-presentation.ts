import type { ExperimentAggregate } from '@/backend/presentation/composition/simulation.composition';

export interface SuperSpreaderRankingRow {
	rank: number;
	agentId: string;
	role: string;
	runCount: number;
	/** この Agent に帰属する新規ケース数 */
	attributableReach: number;
	transmissionCount: number;
	cascadeProbability: number;
	individualRs: number;
	cascadeDepth: number;
	totalSleepLossMinutes: number;
	/** 睡眠不足を持ち込んだ Network の数。境界にいる Agent ほど大きい */
	crossNetworkSpread: number;
	networksTraversed: string[];
}

interface RankingFields {
	role?: unknown;
	transmissionCount?: unknown;
	cascadeDepth?: unknown;
	crossNetworkSpread?: unknown;
	networksTraversed?: unknown;
}

function numberOr(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * 保存された Experiment の結果をランキング行へ変換する。
 *
 * Role / Cascade Depth / Cross-network Spread は集計の共通項目に収まらないため
 * `aggregate` へ入れてある。読み取れない場合も画面を落とさず既定値で表示する。
 */
export function toSuperSpreaderRanking(
	results: readonly ExperimentAggregate[],
): SuperSpreaderRankingRow[] {
	return results.map((result, index) => {
		const extra: RankingFields =
			typeof result.aggregate === 'object' && result.aggregate !== null
				? (result.aggregate as RankingFields)
				: {};

		return {
			rank: index + 1,
			agentId: result.label,
			role: typeof extra.role === 'string' ? extra.role : '-',
			runCount: result.runCount,
			attributableReach: result.averageReach,
			transmissionCount: numberOr(extra.transmissionCount, 0),
			cascadeProbability: result.cascadeProbability,
			individualRs: result.averageRs,
			cascadeDepth: numberOr(extra.cascadeDepth, 0),
			totalSleepLossMinutes: result.totalSleepLossMinutes,
			crossNetworkSpread: numberOr(extra.crossNetworkSpread, 0),
			networksTraversed: Array.isArray(extra.networksTraversed)
				? extra.networksTraversed.filter((name): name is string => typeof name === 'string')
				: [],
		};
	});
}
