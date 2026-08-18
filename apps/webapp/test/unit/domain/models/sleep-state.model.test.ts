import {
	DEFAULT_SLEEP_STATE_THRESHOLDS,
	isSleepDeprivedState,
	sleepStateFrom,
} from '@/backend/domain/models/sleep-state.model';
import { describe, expect, it } from 'vitest';

describe('SleepState', () => {
	const thresholds = DEFAULT_SLEEP_STATE_THRESHOLDS;

	it.each([
		[0, 'normal'],
		[0.99, 'normal'],
		[1, 'tired'],
		[1.99, 'tired'],
		[2, 'sleep_deprived'],
		[4.99, 'sleep_deprived'],
		[5, 'severe_sleep_deprived'],
		[12, 'severe_sleep_deprived'],
	])('Sleep Debt %s 時間は %s', (debt, expected) => {
		expect(sleepStateFrom(debt, thresholds)).toBe(expected);
	});

	it('閾値は Experiment Config から変更できる', () => {
		const custom = { tired: 0.5, sleepDeprived: 1, severe: 2 };
		expect(sleepStateFrom(1, custom)).toBe('sleep_deprived');
		expect(sleepStateFrom(1, thresholds)).toBe('tired');
	});

	it('isDeprived は sleep_deprived 以上で true', () => {
		expect(isSleepDeprivedState('normal')).toBe(false);
		expect(isSleepDeprivedState('tired')).toBe(false);
		expect(isSleepDeprivedState('sleep_deprived')).toBe(true);
		expect(isSleepDeprivedState('severe_sleep_deprived')).toBe(true);
	});
});
