import { DecideAgentActionUseCase } from '@/backend/application/usecases/decide-agent-action.usecase';
import type {
	AiDecisionGateway,
	DecisionContext,
	DecisionResult,
} from '@/backend/domain/gateways/ai-decision.gateway';
import { decisionContextKey } from '@/backend/domain/gateways/decision-cache.gateway';
import { InMemoryDecisionCache } from '@/backend/infrastructure/adapters/in-memory-decision-cache.adapter';
import { describe, expect, it, vi } from 'vitest';

const context: DecisionContext = {
	agent: { role: 'driver', fatigue: 82, sleepDebt: 3.8, responsibility: 0.82, riskTolerance: 0.64 },
	situation: { deliveryDelayMinutes: 25, deadlinePressure: 0.8 },
	actions: ['continue_driving', 'rest'],
};

function gateway(result: DecisionResult): AiDecisionGateway {
	return { decide: vi.fn(async () => result) };
}

function failingGateway(): AiDecisionGateway {
	return {
		decide: vi.fn(async () => {
			throw new Error('OpenRouter unavailable');
		}),
	};
}

const fallbackResult: DecisionResult = {
	action: 'rest',
	reason: 'fallback',
	model: 'rule-based',
};

describe('DecideAgentActionUseCase', () => {
	it('AI の判断結果を返す', async () => {
		const ai = gateway({ action: 'continue_driving', reason: 'ai', model: 'gemma' });
		const useCase = new DecideAgentActionUseCase(
			ai,
			gateway(fallbackResult),
			new InMemoryDecisionCache(),
		);

		const result = await useCase.decide(context);

		expect(result.action).toBe('continue_driving');
		expect(result.model).toBe('gemma');
	});

	it('同じ Context ではキャッシュを使い AI を再呼び出ししない', async () => {
		const ai = gateway({ action: 'continue_driving', reason: 'ai', model: 'gemma' });
		const useCase = new DecideAgentActionUseCase(
			ai,
			gateway(fallbackResult),
			new InMemoryDecisionCache(),
		);

		await useCase.decide(context);
		await useCase.decide(context);

		expect(ai.decide).toHaveBeenCalledTimes(1);
	});

	it('AI が失敗したら Fallback へ切り替える', async () => {
		const fallback = gateway(fallbackResult);
		const useCase = new DecideAgentActionUseCase(
			failingGateway(),
			fallback,
			new InMemoryDecisionCache(),
		);

		const result = await useCase.decide(context);

		expect(result.model).toBe('rule-based');
		expect(fallback.decide).toHaveBeenCalledTimes(1);
		expect(useCase.failureCount).toBe(1);
	});

	it('提示していない action を AI が返したら Fallback へ切り替える', async () => {
		const fallback = gateway(fallbackResult);
		const useCase = new DecideAgentActionUseCase(
			gateway({ action: 'fly_away', reason: 'invalid', model: 'gemma' }),
			fallback,
			new InMemoryDecisionCache(),
		);

		const result = await useCase.decide(context);

		expect(result.action).toBe('rest');
		expect(fallback.decide).toHaveBeenCalledTimes(1);
	});
});

describe('decisionContextKey', () => {
	it('疲労が同じビンに入る Context は同一キーになる', () => {
		const a = decisionContextKey(context);
		const b = decisionContextKey({
			...context,
			agent: { ...context.agent, fatigue: 89 },
		});
		expect(a).toBe(b);
	});

	it('疲労のビンが変わればキーも変わる', () => {
		const a = decisionContextKey(context);
		const b = decisionContextKey({
			...context,
			agent: { ...context.agent, fatigue: 95 },
		});
		expect(a).not.toBe(b);
	});

	it('Role が変わればキーも変わる', () => {
		const a = decisionContextKey(context);
		const b = decisionContextKey({
			...context,
			agent: { ...context.agent, role: 'manager' },
		});
		expect(a).not.toBe(b);
	});

	it('situation のキー順が違っても同一キーになる', () => {
		const a = decisionContextKey(context);
		const b = decisionContextKey({
			...context,
			situation: { deadlinePressure: 0.8, deliveryDelayMinutes: 25 },
		});
		expect(a).toBe(b);
	});

	it('deadlinePressure の高低はビンが分かれる', () => {
		// 0〜1 の値を分単位と同じ幅で丸めると全て同一ビンへ潰れ、Cache が状況を区別できなくなる
		const a = decisionContextKey({ ...context, situation: { deadlinePressure: 0.2 } });
		const b = decisionContextKey({ ...context, situation: { deadlinePressure: 0.9 } });
		expect(a).not.toBe(b);
	});

	it('deadlinePressure が同じビンなら同一キーになる', () => {
		const a = decisionContextKey({ ...context, situation: { deadlinePressure: 0.81 } });
		const b = decisionContextKey({ ...context, situation: { deadlinePressure: 0.89 } });
		expect(a).toBe(b);
	});

	it('遅延分数は 10 分単位でビニングされる', () => {
		const a = decisionContextKey({ ...context, situation: { deliveryDelayMinutes: 21 } });
		const b = decisionContextKey({ ...context, situation: { deliveryDelayMinutes: 29 } });
		const c = decisionContextKey({ ...context, situation: { deliveryDelayMinutes: 31 } });
		expect(a).toBe(b);
		expect(a).not.toBe(c);
	});

	it('ビン境界の値が 1 つ下のビンへ落ちない', () => {
		// 0.3 / 0.1 は 2.9999999999999996 になるため、補正しないと 0.2 のビンに入る
		const boundary = decisionContextKey({ ...context, situation: { deadlinePressure: 0.3 } });
		const inSameBin = decisionContextKey({ ...context, situation: { deadlinePressure: 0.35 } });
		const lowerBin = decisionContextKey({ ...context, situation: { deadlinePressure: 0.29 } });

		expect(boundary).toBe(inSameBin);
		expect(boundary).not.toBe(lowerBin);
	});

	it('actions が違えばキーも変わる', () => {
		const a = decisionContextKey(context);
		const b = decisionContextKey({ ...context, actions: ['go_home', 'overtime'] });
		expect(a).not.toBe(b);
	});
});
