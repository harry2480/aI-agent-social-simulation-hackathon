import type { MetricsSnapshot } from '@/backend/presentation/composition/simulation.composition';
import { TICKS_PER_DAY } from '@/backend/presentation/composition/watch-mode-engine.composition';

/**
 * KPI 時系列グラフの 1 点。
 * Sleep-Deprived Population と Rs はスケールが 2 桁以上違うため、軸を分けて描く。
 */
export interface RunMetricsPoint {
	/** 1 始まりの経過日数。Tick のままでは目盛りが読めない */
	day: number;
	sleepDeprived: number;
	severe: number;
	accidents: number;
	rs: number;
	sleepDebt: number;
}

/**
 * 保存済み Metrics をグラフの系列へ変換する。
 * 桁はグラフの目盛りとツールチップに合わせて丸める。
 */
export function toRunMetricsSeries(metrics: readonly MetricsSnapshot[]): RunMetricsPoint[] {
	return metrics.map((snapshot) => ({
		day: Number((snapshot.tick / TICKS_PER_DAY + 1).toFixed(2)),
		sleepDeprived: snapshot.sleepDeprivedPopulation,
		severe: snapshot.severeSleepDeprivedPopulation,
		accidents: snapshot.accidentCount,
		rs: Number(snapshot.currentRs.toFixed(3)),
		sleepDebt: Number(snapshot.totalSleepDebtHours.toFixed(1)),
	}));
}
