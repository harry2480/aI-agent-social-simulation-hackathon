import type { MetricsSnapshot } from '@/backend/presentation/composition/watch-mode-engine.composition';
import { formatInteger, formatMinutesAsHours, formatNumber } from '@/frontend/lib/format';

export interface KpiRow {
	label: string;
	value: string;
}

/** Rs は疫学上の R0 ではないことを常設で明示する（要件定義 23 章） */
export const RS_DISCLAIMER = 'Rs は SLEEP CITY 独自指標であり、感染症疫学の R0 とは異なります。';

/** Metrics が無いときの表示。Run 開始前と「値が 0」を取り違えないようにする */
const EMPTY = '-';

/**
 * KPI パネルの表示行を組み立てる。
 * Run 開始前は metrics が null になるため、全項目を EMPTY で埋める。
 */
export function buildKpiRows(metrics: MetricsSnapshot | null, population: number): KpiRow[] {
	if (metrics === null) {
		return KPI_LABELS.map((label) => ({ label, value: EMPTY }));
	}

	return [
		{ label: 'Current Rs', value: formatNumber(metrics.currentRs) },
		{
			label: 'Sleep-Deprived',
			value: `${formatInteger(metrics.sleepDeprivedPopulation)} / ${formatInteger(population)}`,
		},
		{ label: 'Severe', value: formatInteger(metrics.severeSleepDeprivedPopulation) },
		{ label: 'Total Sleep Debt', value: `${formatNumber(metrics.totalSleepDebtHours, 1)} h` },
		{ label: 'Total Sleep Loss', value: formatMinutesAsHours(metrics.totalSleepLossMinutes) },
		{ label: 'Cascade Reach', value: formatInteger(metrics.cascadeReach) },
		{ label: 'Cascade Depth', value: formatInteger(metrics.cascadeDepth) },
		{ label: 'Generation', value: formatInteger(metrics.cascadeGeneration) },
		{ label: 'Accidents', value: formatInteger(metrics.accidentCount) },
		{ label: 'Overtime', value: `${formatNumber(metrics.overtimeHours, 1)} h` },
		{
			label: 'Avg Commute Delay',
			value: `${formatNumber(metrics.averageCommuteDelayMinutes, 1)} min`,
		},
	];
}

/** 表示順。Metrics が無くても同じ並び・同じ行数を出し、レイアウトを揺らさない */
const KPI_LABELS = [
	'Current Rs',
	'Sleep-Deprived',
	'Severe',
	'Total Sleep Debt',
	'Total Sleep Loss',
	'Cascade Reach',
	'Cascade Depth',
	'Generation',
	'Accidents',
	'Overtime',
	'Avg Commute Delay',
];
