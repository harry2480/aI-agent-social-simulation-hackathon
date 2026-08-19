import type {
	ExperimentAggregate,
	StoredRun,
} from '@/backend/presentation/composition/simulation.composition';

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

export function formatPercent(value: number, fractionDigits = 0): string {
	if (!Number.isFinite(value)) {
		return '-';
	}
	return `${(value * 100).toFixed(fractionDigits)}%`;
}

export function formatDelta(value: number | null, fractionDigits = 1): string {
	if (value === null || !Number.isFinite(value)) {
		return '-';
	}
	const sign = value > 0 ? '+' : '';
	return `${sign}${value.toFixed(fractionDigits)}`;
}
