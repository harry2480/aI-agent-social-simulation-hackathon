import type { DecisionContext } from '@/backend/domain/gateways/ai-decision.gateway';
import {
	DEFAULT_AI_MODEL,
	OpenRouterAiDecisionGateway,
} from '@/backend/infrastructure/adapters/openrouter-ai-decision.adapter';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.unstubAllGlobals();
});

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

	it('Structured Output のスキーマと actions を API へ送り、選ばれた action を返す', async () => {
		// Integration では失敗系まで検証する。ここは CI（Unit のみ実行）で本番経路を通すための 1 本
		const fetchSpy = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response(
					JSON.stringify({
						id: 'chatcmpl-test',
						object: 'chat.completion',
						created: 0,
						model: 'test/model',
						choices: [
							{
								index: 0,
								message: {
									role: 'assistant',
									content: JSON.stringify({ action: 'rest', reason: '疲労が限界のため' }),
								},
								finish_reason: 'stop',
							},
						],
						usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } },
				),
		);
		vi.stubGlobal('fetch', fetchSpy);
		const gateway = new OpenRouterAiDecisionGateway('dummy-key', 'test/model');

		const result = await gateway.decide({
			agent: { role: 'driver', fatigue: 88, sleepDebt: 4, responsibility: 0.9, riskTolerance: 0.2 },
			situation: { deadlinePressure: 0.8 },
			actions: ['continue_driving', 'rest'],
		});

		expect(result).toEqual({ action: 'rest', reason: '疲労が限界のため', model: 'test/model' });
		const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as {
			response_format?: { type: string };
		};
		expect(body.response_format?.type).toBe('json_schema');
	});
});
