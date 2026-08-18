import type { DecisionContext } from '@/backend/domain/gateways/ai-decision.gateway';
import {
	DEFAULT_AI_MODEL,
	OpenRouterAiDecisionGateway,
} from '@/backend/infrastructure/adapters/openrouter-ai-decision.adapter';
import { describe, expect, it } from 'vitest';

describe('OpenRouterAiDecisionGateway', () => {
	it('既定モデルはソースへ固定せず定数から取得する', () => {
		expect(DEFAULT_AI_MODEL).toBe('google/gemma-3-27b-it');
	});

	it('actions が空なら推論を行わず例外を投げる', async () => {
		const gateway = new OpenRouterAiDecisionGateway('dummy-key');
		const context: DecisionContext = {
			agent: { role: 'driver', fatigue: 50, sleepDebt: 1, responsibility: 0.5, riskTolerance: 0.5 },
			situation: {},
			actions: [],
		};

		await expect(gateway.decide(context)).rejects.toThrow(/actions is empty/);
	});
});
