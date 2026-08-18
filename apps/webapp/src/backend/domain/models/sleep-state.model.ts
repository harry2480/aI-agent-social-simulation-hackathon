export type SleepStateName = 'normal' | 'tired' | 'sleep_deprived' | 'severe_sleep_deprived';

/** 睡眠状態の判定閾値（Sleep Debt の時間数）。ExperimentConfig から変更可能 */
export interface SleepStateThresholds {
	/** この値以上で tired */
	tired: number;
	/** この値以上で sleep_deprived */
	sleepDeprived: number;
	/** この値以上で severe_sleep_deprived */
	severe: number;
}

export const DEFAULT_SLEEP_STATE_THRESHOLDS: SleepStateThresholds = {
	tired: 1,
	sleepDeprived: 2,
	severe: 5,
};

/** Sleep Debt から睡眠状態を判定する */
export function sleepStateFrom(
	sleepDebtHours: number,
	thresholds: SleepStateThresholds,
): SleepStateName {
	if (sleepDebtHours >= thresholds.severe) {
		return 'severe_sleep_deprived';
	}
	if (sleepDebtHours >= thresholds.sleepDeprived) {
		return 'sleep_deprived';
	}
	if (sleepDebtHours >= thresholds.tired) {
		return 'tired';
	}
	return 'normal';
}

/** New Sleep-Deprived Case の判定に使う。sleep_deprived 以上を睡眠不足とみなす */
export function isSleepDeprivedState(state: SleepStateName): boolean {
	return state === 'sleep_deprived' || state === 'severe_sleep_deprived';
}
