import { MINUTES_PER_TICK } from '@/backend/domain/models/simulation-clock.model';
import { SleepService } from '@/backend/domain/services/sleep.service';
import { describe, expect, it } from 'vitest';
import { createTestAgent } from '../../../helpers/agent';

describe('SleepService.applyTick', () => {
	const service = new SleepService();

	it('睡眠中なら 1 Tick 分の睡眠を記録する', () => {
		const agent = createTestAgent({ currentAction: 'sleeping' });

		service.applyTick(agent);

		expect(agent.sleepMinutesThisNight).toBe(MINUTES_PER_TICK);
	});

	it('睡眠中でなければ何も記録しない', () => {
		// 休憩は Fatigue を回復させるが Sleep Debt には効かない
		const agent = createTestAgent({ currentAction: 'resting' });

		service.applyTick(agent);

		expect(agent.sleepMinutesThisNight).toBe(0);
	});
});

describe('SleepService.closeNight', () => {
	const service = new SleepService();

	it('必要睡眠に満たない分を Sleep Debt へ積む', () => {
		// 必要 8 時間に対し 6 時間しか眠れなかった夜
		const agent = createTestAgent({ sleepNeedHours: 8, sleepMinutesThisNight: 360 });

		const result = service.closeNight(agent);

		expect(result.deficitHours).toBeCloseTo(2, 10);
		expect(result.recoveredHours).toBe(0);
		expect(agent.sleepDebtHours).toBeCloseTo(2, 10);
	});

	it('超過分の 50% を Sleep Debt から回復させる', () => {
		// 必要 8 時間に対し 10 時間眠った夜。超過 2 時間 × 0.5 = 1 時間の回復
		const agent = createTestAgent({
			sleepNeedHours: 8,
			sleepMinutesThisNight: 600,
			sleepDebtHours: 3,
		});

		const result = service.closeNight(agent);

		expect(result.recoveredHours).toBeCloseTo(1, 10);
		expect(agent.sleepDebtHours).toBeCloseTo(2, 10);
	});

	it('回復量は残っている Sleep Debt を超えない', () => {
		const agent = createTestAgent({
			sleepNeedHours: 8,
			sleepMinutesThisNight: 720,
			sleepDebtHours: 0.5,
		});

		service.closeNight(agent);

		expect(agent.sleepDebtHours).toBe(0);
	});

	it('回復率を変えると回復量が変わる', () => {
		// 回復率は Simulation の感度分析で振るためコンストラクタで差し替えられる
		const build = () =>
			createTestAgent({ sleepNeedHours: 8, sleepMinutesThisNight: 600, sleepDebtHours: 5 });
		const slow = build();
		const fast = build();

		new SleepService(0.25).closeNight(slow);
		new SleepService(1).closeNight(fast);

		expect(slow.sleepDebtHours).toBeCloseTo(4.5, 10);
		expect(fast.sleepDebtHours).toBeCloseTo(3, 10);
	});

	it('確定後は次の夜のためにその晩の睡眠時間を 0 へ戻す', () => {
		const agent = createTestAgent({ sleepNeedHours: 8, sleepMinutesThisNight: 360 });

		service.closeNight(agent);

		expect(agent.sleepMinutesThisNight).toBe(0);
	});

	it('不足が続くと Sleep Debt が累積する', () => {
		const agent = createTestAgent({ sleepNeedHours: 8 });

		for (let night = 0; night < 3; night++) {
			agent.recordSleepMinutes(360);
			service.closeNight(agent);
		}

		expect(agent.sleepDebtHours).toBeCloseTo(6, 10);
	});
});
