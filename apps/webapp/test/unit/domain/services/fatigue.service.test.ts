import type { AgentActionName } from '@/backend/domain/models/agent.model';
import { FatigueService } from '@/backend/domain/services/fatigue.service';
import { describe, expect, it } from 'vitest';
import { createTestAgent } from '../../../helpers/agent';

const service = new FatigueService();

/** 1 Tick 進めたあとの Fatigue / Stress を返す */
function afterTick(
	action: AgentActionName,
	options: { fatigue?: number; stress?: number; sleepDebtHours?: number } = {},
): { fatigue: number; stress: number } {
	const agent = createTestAgent({ currentAction: action, ...options });
	service.applyTick(agent);
	return { fatigue: agent.fatigue, stress: agent.stress };
}

describe('FatigueService.applyTick', () => {
	it('Action ごとに Fatigue の増減量が変わる', () => {
		// 残業は通常勤務より、運転は通勤より疲労が重い
		expect(afterTick('overtime').fatigue).toBeGreaterThan(afterTick('working').fatigue);
		expect(afterTick('driving').fatigue).toBeGreaterThan(afterTick('commuting').fatigue);
		expect(afterTick('delivering').fatigue).toBe(afterTick('driving').fatigue);
		expect(afterTick('shopping').fatigue).toBe(afterTick('housework').fatigue);
	});

	it('休憩と睡眠は Fatigue を減らし、睡眠のほうが回復量が大きい', () => {
		// Fatigue 50 から減らす。0 で下限クリップされないだけの初期値を置く
		const resting = afterTick('resting', { fatigue: 50 });
		const sleeping = afterTick('sleeping', { fatigue: 50 });

		expect(resting.fatigue).toBeLessThan(50);
		expect(sleeping.fatigue).toBeLessThan(resting.fatigue);
	});

	it('morning_routine と idle では何も変化しない', () => {
		expect(afterTick('morning_routine', { fatigue: 30, stress: 20 })).toEqual({
			fatigue: 30,
			stress: 20,
		});
		expect(afterTick('idle', { fatigue: 30, stress: 20 })).toEqual({ fatigue: 30, stress: 20 });
	});

	it('Sleep Debt が大きいほど労働時の疲労蓄積が速くなる', () => {
		// Sleep Debt 1 時間ごとに蓄積が 12% 増える
		const rested = afterTick('working', { sleepDebtHours: 0 });
		const indebted = afterTick('working', { sleepDebtHours: 5 });

		expect(indebted.fatigue).toBeCloseTo(rested.fatigue * 1.6, 5);
	});

	it('Sleep Debt が大きいほど睡眠による回復効率が落ちる', () => {
		// これが無いと 1 晩で疲労が完全にリセットされ、疲労が蓄積しなくなる
		const rested = afterTick('sleeping', { fatigue: 50, sleepDebtHours: 0 });
		const indebted = afterTick('sleeping', { fatigue: 50, sleepDebtHours: 4 });

		expect(50 - indebted.fatigue).toBeLessThan(50 - rested.fatigue);
	});

	it('残業は通常勤務より Stress の増加が大きい', () => {
		expect(afterTick('overtime').stress).toBeGreaterThan(afterTick('working').stress);
	});

	it('通勤・家事では Stress が変化しない', () => {
		expect(afterTick('commuting', { stress: 20 }).stress).toBe(20);
		expect(afterTick('housework', { stress: 20 }).stress).toBe(20);
	});

	it('Fatigue は 0〜100 の範囲を超えない', () => {
		expect(afterTick('overtime', { fatigue: 100, sleepDebtHours: 10 }).fatigue).toBe(100);
		expect(afterTick('sleeping', { fatigue: 0 }).fatigue).toBe(0);
	});
});

describe('FatigueService.applyImpact', () => {
	it('Event の影響を Fatigue と Stress へ加算する', () => {
		const agent = createTestAgent({ fatigue: 10, stress: 10 });

		service.applyImpact(agent, 5, 3);

		expect(agent.fatigue).toBe(15);
		expect(agent.stress).toBe(13);
	});

	it('負の影響でも 0 を下回らない', () => {
		const agent = createTestAgent({ fatigue: 2, stress: 2 });

		service.applyImpact(agent, -10, -10);

		expect(agent.fatigue).toBe(0);
		expect(agent.stress).toBe(0);
	});
});
