import {
	MINUTES_PER_TICK,
	SimulationClock,
	TICKS_PER_DAY,
	TICKS_PER_HOUR,
} from '@/backend/domain/models/simulation-clock.model';
import { describe, expect, it } from 'vitest';

describe('SimulationClock', () => {
	it('start は tick 0 から始まる', () => {
		expect(SimulationClock.start().tick).toBe(0);
	});

	it('1 Tick は 15 分、1 日は 96 Tick', () => {
		expect(MINUTES_PER_TICK).toBe(15);
		expect(TICKS_PER_HOUR).toBe(4);
		expect(TICKS_PER_DAY).toBe(96);
	});

	it('advance は新しいインスタンスを返し元を変更しない', () => {
		const clock = SimulationClock.start();
		const next = clock.advance();
		expect(clock.tick).toBe(0);
		expect(next.tick).toBe(1);
	});

	it.each([
		[0, 0, 0, 0],
		[1, 0, 0, 15],
		[4, 0, 1, 0],
		[36, 0, 9, 0],
		[95, 0, 23, 45],
		[96, 1, 0, 0],
		[100, 1, 1, 0],
	])('tick %s は Day %s %s:%s', (tick, day, hour, minute) => {
		const clock = SimulationClock.fromTick(tick);
		expect(clock.day).toBe(day);
		expect(clock.hour).toBe(hour);
		expect(clock.minute).toBe(minute);
	});

	it('minutesOfDay はその日の 0:00 からの経過分', () => {
		expect(SimulationClock.fromTick(36).minutesOfDay).toBe(9 * 60);
		expect(SimulationClock.fromTick(96 + 36).minutesOfDay).toBe(9 * 60);
	});

	it('isEndOfDay は日の最終 Tick でのみ true', () => {
		expect(SimulationClock.fromTick(94).isEndOfDay).toBe(false);
		expect(SimulationClock.fromTick(95).isEndOfDay).toBe(true);
		expect(SimulationClock.fromTick(96).isEndOfDay).toBe(false);
		expect(SimulationClock.fromTick(191).isEndOfDay).toBe(true);
	});

	it('format は 1 始まりの日付とゼロ埋めした時刻を返す', () => {
		expect(SimulationClock.fromTick(0).format()).toBe('Day 1 00:00');
		expect(SimulationClock.fromTick(37).format()).toBe('Day 1 09:15');
		expect(SimulationClock.fromTick(96 + 95).format()).toBe('Day 2 23:45');
	});

	it('負の tick や小数を拒否する', () => {
		expect(() => SimulationClock.fromTick(-1)).toThrow();
		expect(() => SimulationClock.fromTick(1.5)).toThrow();
	});
});
