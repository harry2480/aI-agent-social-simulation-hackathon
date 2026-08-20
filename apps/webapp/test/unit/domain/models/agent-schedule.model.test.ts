import { scheduleForRole, scheduledBedTick } from '@/backend/domain/models/agent-schedule.model';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/backend/domain/models/simulation-clock.model';
import { describe, expect, it } from 'vitest';

describe('scheduleForRole', () => {
	it('職種ごとの始業・終業時刻を tick へ変換する', () => {
		expect(scheduleForRole('office_worker', 4).workStartTickOfDay).toBe(9 * TICKS_PER_HOUR);
		expect(scheduleForRole('office_worker', 4).workEndTickOfDay).toBe(18 * TICKS_PER_HOUR);
		expect(scheduleForRole('driver', 4).workStartTickOfDay).toBe(6 * TICKS_PER_HOUR);
		expect(scheduleForRole('delivery_worker', 4).workStartTickOfDay).toBe(8 * TICKS_PER_HOUR);
		expect(scheduleForRole('store_worker', 4).workStartTickOfDay).toBe(10 * TICKS_PER_HOUR);
	});

	it('Manager は部下と同じ終業時刻にする', () => {
		// 部下より遅い終業にすると、残業要請を判断する時点で部下が既に退勤しており、
		// Work Network 経由の残業伝播が構造的に発生しなくなる
		expect(scheduleForRole('manager', 4)).toEqual(scheduleForRole('office_worker', 4));
	});

	it('出発時刻は始業から通勤時間を引いた時刻になる', () => {
		const schedule = scheduleForRole('office_worker', 6);

		expect(schedule.departForWorkTickOfDay).toBe(9 * TICKS_PER_HOUR - 6);
	});

	it('起床は出発の 2 Tick 前（朝の支度 30 分）', () => {
		const schedule = scheduleForRole('office_worker', 6);

		expect(schedule.wakeTickOfDay).toBe(schedule.departForWorkTickOfDay - 2);
	});

	it('通勤時間が長すぎても出発・起床が前日へ食い込まない', () => {
		// Driver は 6:00 始業のため、通勤が長いと 0:00 より前になってしまう
		const schedule = scheduleForRole('driver', 100);

		expect(schedule.departForWorkTickOfDay).toBe(0);
		expect(schedule.wakeTickOfDay).toBe(0);
	});
});

describe('scheduledBedTick', () => {
	const nextWakeTick = TICKS_PER_DAY + 7 * TICKS_PER_HOUR;

	it('必要睡眠が短ければ習慣的な就寝時刻（23:00）を採る', () => {
		// 23:00 に寝れば翌 7:00 まで 8 時間眠れるため、逆算のほうが遅くなる
		const bedTick = scheduledBedTick(0, nextWakeTick, 6);

		expect(bedTick).toBe(23 * TICKS_PER_HOUR);
	});

	it('必要睡眠が長ければ起床時刻からの逆算を採る', () => {
		// 9 時間必要なら 22:00 に寝ないと足りない
		const bedTick = scheduledBedTick(0, nextWakeTick, 9);

		expect(bedTick).toBe(nextWakeTick - 9 * TICKS_PER_HOUR);
		expect(bedTick).toBeLessThan(23 * TICKS_PER_HOUR);
	});

	it('必要睡眠が長い Agent ほど夜の余裕が小さい', () => {
		// この個人差がそのまま「遅延に脆いかどうか」の差になる
		const shortSleeper = scheduledBedTick(0, nextWakeTick, 6.5);
		const longSleeper = scheduledBedTick(0, nextWakeTick, 8.5);

		expect(longSleeper).toBeLessThanOrEqual(shortSleeper);
	});

	it('全職種一律にはならず、日の起点を跨いでも同じ関係が保たれる', () => {
		const dayStart = 3 * TICKS_PER_DAY;
		const wake = dayStart + TICKS_PER_DAY + 7 * TICKS_PER_HOUR;

		expect(scheduledBedTick(dayStart, wake, 6)).toBe(dayStart + 23 * TICKS_PER_HOUR);
		expect(scheduledBedTick(dayStart, wake, 9)).toBe(wake - 9 * TICKS_PER_HOUR);
	});

	it('必要睡眠時間は 15 分単位へ丸めて扱う', () => {
		// Tick は 15 分刻みのため、8.3 時間は 33 Tick（8 時間 15 分）へ丸められる
		const bedTick = scheduledBedTick(0, nextWakeTick, 8.3);

		expect(bedTick).toBe(nextWakeTick - 33);
	});
});
