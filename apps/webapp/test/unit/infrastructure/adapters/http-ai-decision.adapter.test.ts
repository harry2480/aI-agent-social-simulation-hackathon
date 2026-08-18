import type { DecisionContext } from '@/backend/domain/gateways/ai-decision.gateway';
import { HttpAiDecisionGateway } from '@/backend/infrastructure/adapters/http-ai-decision.adapter';
import { afterEach, describe, expect, it, vi } from 'vitest';

const context: DecisionContext = {
	agent: { role: 'driver', fatigue: 80, sleepDebt: 3, responsibility: 0.8, riskTolerance: 0.5 },
	situation: { deadlinePressure: 0.6 },
	actions: ['continue_driving', 'rest'],
};

/** fetch の呼び出し引数を型安全に読めるようにする */
function stubFetch(response: () => Response) {
	const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
		Promise.resolve(response()),
	);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('HttpAiDecisionGateway', () => {
	it('Route Handler へ POST して結果を返す', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ action: 'rest', reason: '疲労', model: 'gemma' }), {
					status: 200,
				}),
		);
		vi.stubGlobal('fetch', fetchMock);

		const result = await new HttpAiDecisionGateway().decide(context);

		expect(result).toEqual({ action: 'rest', reason: '疲労', model: 'gemma' });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('既定のエンドポイントは /api/agents/decision', async () => {
		const fetchMock = stubFetch(() => new Response('{}', { status: 200 }));

		await new HttpAiDecisionGateway().decide(context);

		expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/agents/decision');
	});

	it('Context を JSON ボディで送る', async () => {
		const fetchMock = stubFetch(() => new Response('{}', { status: 200 }));

		await new HttpAiDecisionGateway().decide(context);

		const init = fetchMock.mock.calls[0]?.[1];
		expect(init?.method).toBe('POST');
		expect(JSON.parse(String(init?.body))).toEqual(context);
	});

	it('タイムアウト用の AbortSignal を渡す', async () => {
		const fetchMock = stubFetch(() => new Response('{}', { status: 200 }));

		await new HttpAiDecisionGateway().decide(context);

		const init = fetchMock.mock.calls[0]?.[1];
		expect(init?.signal).toBeInstanceOf(AbortSignal);
	});

	it('エラー応答では例外を投げ、UseCase 側の Fallback へ倒す', async () => {
		stubFetch(() => new Response('error', { status: 500 }));

		await expect(new HttpAiDecisionGateway().decide(context)).rejects.toThrow(/500/);
	});

	it('通信自体が失敗した場合も例外を投げる', async () => {
		stubFetch(() => {
			throw new Error('network down');
		});

		await expect(new HttpAiDecisionGateway().decide(context)).rejects.toThrow('network down');
	});
});
