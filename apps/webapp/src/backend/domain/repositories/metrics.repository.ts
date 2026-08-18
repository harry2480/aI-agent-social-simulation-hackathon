import type { MetricsSnapshot } from '../models/metrics.model';

/** KPI 時系列グラフに使う読み取り専用 Repository */
export interface MetricsRepository {
	findByRunId(runId: string): Promise<MetricsSnapshot[]>;
}
