/** Tick 断面の KPI（要件定義 25 章） */
export interface MetricsSnapshot {
	tick: number;
	currentRs: number;
	sleepDeprivedPopulation: number;
	severeSleepDeprivedPopulation: number;
	totalSleepDebtHours: number;
	totalSleepLossMinutes: number;
	cascadeReach: number;
	cascadeDepth: number;
	cascadeGeneration: number;
	accidentCount: number;
	trafficDelayMinutes: number;
	overtimeHours: number;
	averageCommuteDelayMinutes: number;
}

/** Run 全体の集計結果 */
export interface RunSummary {
	currentRs: number;
	peakRs: number;
	averageRs: number;
	sleepDeprivedPopulation: number;
	severeSleepDeprivedPopulation: number;
	totalSleepDebtHours: number;
	totalSleepLossMinutes: number;
	cascadeReach: number;
	cascadeDepth: number;
	cascadeGeneration: number;
	accidentCount: number;
	trafficDelayMinutes: number;
	overtimeHours: number;
	averageCommuteDelayMinutes: number;
	cascadeOccurred: boolean;
}
