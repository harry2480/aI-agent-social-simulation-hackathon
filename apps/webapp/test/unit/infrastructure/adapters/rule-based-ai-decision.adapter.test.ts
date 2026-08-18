import type { DecisionContext } from '@/backend/domain/gateways/ai-decision.gateway';
import { RuleBasedAiDecisionGateway } from '@/backend/infrastructure/adapters/rule-based-ai-decision.adapter';
import { describe, expect, it } from 'vitest';

const gateway = new RuleBasedAiDecisionGateway();

function context(
	agent: Partial<DecisionContext['agent']>,
	actions: string[],
	situation: Record<string, number> = {},
): DecisionContext {
	return {
		agent: {
			role: 'driver',
			fatigue: 50,
			sleepDebt: 0,
			responsibility: 0.5,
			riskTolerance: 0.5,
			...agent,
		},
		situation,
		actions,
	};
}

describe('RuleBasedAiDecisionGateway', () => {
	it('限界に近い疲労かつリスク回避的なら休憩を選ぶ', async () => {
		const result = await gateway.decide(
			context({ fatigue: 90, riskTolerance: 0.3, responsibility: 0.5 }, [
				'continue_driving',
				'rest',
			]),
		);
		expect(result.action).toBe('rest');
	});

	it('責任感が高ければ疲労していても運転を継続する', async () => {
		const result = await gateway.decide(
			context({ fatigue: 80, riskTolerance: 0.2, responsibility: 0.9 }, [
				'continue_driving',
				'rest',
			]),
		);
		expect(result.action).toBe('continue_driving');
	});

	it('終業時の既定は帰宅であり、全員が残業するわけではない', async () => {
		const result = await gateway.decide(
			context({ responsibility: 0.5 }, ['go_home', 'overtime'], { deadlinePressure: 0.2 }),
		);
		expect(result.action).toBe('go_home');
	});

	it('責任感と締切圧力がともに高い場合のみ残業を選ぶ', async () => {
		const result = await gateway.decide(
			context({ responsibility: 0.9 }, ['go_home', 'overtime'], { deadlinePressure: 0.8 }),
		);
		expect(result.action).toBe('overtime');
	});

	it('提示された actions の外を選ばない', async () => {
		const actions = ['do_housework', 'ask_family', 'sleep'];
		const result = await gateway.decide(context({ fatigue: 95 }, actions));
		expect(actions).toContain(result.action);
	});

	it('model には rule-based が入る', async () => {
		const result = await gateway.decide(context({}, ['go_home', 'overtime']));
		expect(result.model).toBe('rule-based');
	});

	it('actions が空なら例外を投げる', async () => {
		await expect(gateway.decide(context({}, []))).rejects.toThrow();
	});
});
