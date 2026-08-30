/** Tick 断面の KPI（要件定義 25 章） */
export interface MetricsSnapshot {
	tick: number;
	currentRs: number;
	/**
	 * その時点までの Rs 系列の最大値・平均値。
	 * Run 終了後の RunSummary と同じ Generation 系列から出すため、
	 * Watch Mode の KPI と Experiment Dashboard の値が同じ定義で並ぶ。
	 */
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
	/** Rs の世代継続を問わず Cascade Reach が閾値へ達したか（24 章の判定を補う指標） */
	outbreakOccurred: boolean;
	/** Rs が閾値を超えたあと初めて閾値以下へ落ちた世代。一度も超えなければ null */
	dampingGeneration: number | null;
}
