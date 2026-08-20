import type {
	ExperimentAggregate,
	StoredRun,
} from '@/backend/presentation/composition/simulation.composition';

/** 条件比較表の 1 行 */
export interface ComparisonRow {
	label: string;
	runCount: number;
	cascadeProbability: number;
	averageReach: number;
	/** Cascade Reach の標準偏差。平均だけでは Seed 間のばらつきが読めない（要件定義 28 章） */
	standardDeviation: number;
	averageRs: number;
	peakRs: number;
	totalSleepLossMinutes: number;
	/** 対照条件との Cascade Reach 差。対照が無ければ null */
	reachDeltaVsControl: number | null;
	/**
	 * Rs の世代継続を問わず Cascade Reach が閾値へ達した Run の割合。
	 * この指標を持たない古い実験では null（要件定義 24 章の判定を補う指標）
	 */
	outbreakProbability: number | null;
	/** Rs が閾値を超えたあと収束し始めた世代の平均。古い実験や山が無い条件では null */
	averageDampingGeneration: number | null;
}

interface SupplementaryAggregate {
	outbreakProbability?: unknown;
	averageDampingGeneration?: unknown;
}

/**
 * 補助指標は experiment_results の aggregate（JSON）にだけ入っている。
 * これらを追加する前に保存された実験には存在しないため、読めない場合は null を返す。
 */
function readSupplementary(aggregate: unknown): {
	outbreakProbability: number | null;
	averageDampingGeneration: number | null;
} {
	if (typeof aggregate !== 'object' || aggregate === null) {
		return { outbreakProbability: null, averageDampingGeneration: null };
	}
	const fields = aggregate as SupplementaryAggregate;
	return {
		outbreakProbability:
			typeof fields.outbreakProbability === 'number' ? fields.outbreakProbability : null,
		averageDampingGeneration:
			typeof fields.averageDampingGeneration === 'number' ? fields.averageDampingGeneration : null,
	};
}

/** 比較実験の対照条件として扱うラベル。Batch Runner が付ける名前に合わせる */
const CONTROL_LABELS = ['baseline', 'none'];

function findControl(results: readonly ExperimentAggregate[]): ExperimentAggregate | undefined {
	return results.find((result) => CONTROL_LABELS.includes(result.label));
}

/**
 * 条件別の集計を比較表の行へ変換する。
 * 対照条件が含まれる場合は、そこからの Cascade Reach 差を併記する。
 */
export function toComparisonRows(results: readonly ExperimentAggregate[]): ComparisonRow[] {
	const control = findControl(results);

	return results.map((result) => ({
		...readSupplementary(result.aggregate),
		label: result.label,
		runCount: result.runCount,
		cascadeProbability: result.cascadeProbability,
		averageReach: result.averageReach,
		standardDeviation: result.standardDeviation,
		averageRs: result.averageRs,
		peakRs: result.peakRs,
		totalSleepLossMinutes: result.totalSleepLossMinutes,
		reachDeltaVsControl:
			control === undefined || control.label === result.label
				? null
				: result.averageReach - control.averageReach,
	}));
}

interface RunConditionFields {
	shockTarget?: unknown;
	initialSleepDeprivedRate?: unknown;
	intervention?: unknown;
}

/**
 * Run の Config スナップショットから「何を変えた Run か」を読み取る。
 * 比較実験では Experimental Variable 以外を固定するため、この 3 つで条件を識別できる。
 */
export function describeRunCondition(config: unknown): string {
	if (typeof config !== 'object' || config === null) {
		return '-';
	}
	const fields = config as RunConditionFields;
	const parts: string[] = [];

	if (typeof fields.shockTarget === 'string') {
		parts.push(`shock: ${fields.shockTarget}`);
	}
	if (typeof fields.initialSleepDeprivedRate === 'number') {
		parts.push(`initial: ${(fields.initialSleepDeprivedRate * 100).toFixed(0)}%`);
	}
	parts.push(
		`intervention: ${typeof fields.intervention === 'string' ? fields.intervention : 'none'}`,
	);

	return parts.join(' / ');
}

/** Run を条件ごとにまとめる。同一条件の Seed 違いを並べて見せるため */
export function groupRunsByCondition(runs: readonly StoredRun[]): Map<string, StoredRun[]> {
	const grouped = new Map<string, StoredRun[]>();
	for (const run of runs) {
		const key = describeRunCondition(run.config);
		const bucket = grouped.get(key);
		if (bucket === undefined) {
			grouped.set(key, [run]);
			continue;
		}
		bucket.push(run);
	}
	return grouped;
}

/** 0〜1 の割合を百分率の文字列にする */
export function formatPercent(value: number, fractionDigits = 0): string {
	if (!Number.isFinite(value)) {
		return '-';
	}
	return `${(value * 100).toFixed(fractionDigits)}%`;
}

/** 増減を符号付きで表す。差が無い（対照条件が無い）場合は `-` */
export function formatDelta(value: number | null, fractionDigits = 1): string {
	if (value === null || !Number.isFinite(value)) {
		return '-';
	}
	const sign = value > 0 ? '+' : '';
	return `${sign}${value.toFixed(fractionDigits)}`;
}
