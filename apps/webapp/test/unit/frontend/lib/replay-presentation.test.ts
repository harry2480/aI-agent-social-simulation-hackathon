import { parseReplayParams, replayLabel } from '@/frontend/lib/replay-presentation';
import { describe, expect, it } from 'vitest';

describe('parseReplayParams', () => {
	it('保存された Config を再実行用パラメータへ戻す', () => {
		const params = parseReplayParams({
			seed: 42,
			population: 300,
			days: 7,
			initialSleepDeprivedRate: 0.1,
			initialSleepDebtHours: 4,
			shockTarget: 'driver',
			trafficLevel: 1.2,
			intervention: 'mandatory_rest',
			aiDecisionEnabled: true,
		});

		expect(params).toEqual({
			seed: 42,
			population: 300,
			days: 7,
			initialSleepDeprivedRate: 0.1,
			initialSleepDebtHours: 4,
			shockTarget: 'driver',
			trafficLevel: 1.2,
			intervention: 'mandatory_rest',
			aiDecisionEnabled: true,
		});
	});

	it('Seed・Population・Days が欠けた Config は再実行できない', () => {
		expect(parseReplayParams({ population: 300, days: 7 })).toBeNull();
		expect(parseReplayParams({ seed: 1, days: 7 })).toBeNull();
		expect(parseReplayParams(null)).toBeNull();
		expect(parseReplayParams('broken')).toBeNull();
	});

	it('未知の Shock Target / Intervention は既定値へ落とす', () => {
		const params = parseReplayParams({
			seed: 1,
			population: 50,
			days: 2,
			shockTarget: 'unknown-target',
			intervention: 'unknown-intervention',
		});

		expect(params?.shockTarget).toBe('none');
		expect(params?.intervention).toBeNull();
		expect(params?.aiDecisionEnabled).toBe(false);
	});
});

describe('replayLabel', () => {
	it('再実行条件を 1 行で示す', () => {
		expect(
			replayLabel({
				seed: 42,
				population: 300,
				days: 7,
				initialSleepDeprivedRate: 0.1,
				shockTarget: 'driver',
				intervention: null,
			}),
		).toBe('seed 42 / 300 agents / 7 days / shock: driver');
	});

	it('Intervention があれば併記する', () => {
		expect(
			replayLabel({
				seed: 1,
				population: 50,
				days: 2,
				initialSleepDeprivedRate: 0,
				shockTarget: 'none',
				intervention: 'remote_work',
			}),
		).toContain('intervention: remote_work');
	});
});
