import type { DecisionContext } from '@/backend/domain/gateways/ai-decision.gateway';
import { OpenRouterAiDecisionGateway } from '@/backend/infrastructure/adapters/openrouter-ai-decision.adapter';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * OpenRouter Adapter の Structured Output 検証。
 *
 * 実 API は Rate Limit とコストを避けるため叩かず、OpenAI 互換のレスポンスを
 * Fake の fetch で返して AI SDK のパース経路を通す（docs/テストガイドライン.md）。
 */
const RUN_INTEGRATION = process.env.INTEGRATION_TEST === 'true';

const CONTEXT: DecisionContext = {
	agent: { role: 'driver', fatigue: 88, sleepDebt: 4.5, responsibility: 0.9, riskTolerance: 0.2 },
	situation: { deadlinePressure: 0.8 },
	actions: ['rest', 'continue_driving', 'ask_help'],
};

interface RequestBody {
	model: string;
	messages: { role: string; content: string }[];
	response_format?: {
		type: string;
		json_schema?: { schema: { properties: { action: { enum: string[] } } } };
	};
}

/** OpenAI 互換の Chat Completion レスポンスを組み立てる */
function completion(content: string): Response {
	return new Response(
		JSON.stringify({
			id: 'chatcmpl-test',
			object: 'chat.completion',
			created: 0,
			model: 'test/model',
			choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
			usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json' } },
	);
}

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
	const spy = vi.fn(handler);
	vi.stubGlobal('fetch', spy);
	return spy;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe.skipIf(!RUN_INTEGRATION)('OpenRouterAiDecisionGateway (integration)', () => {
	it('Structured Output をパースして action / reason / model を返す', async () => {
		const fetchSpy = stubFetch(async () =>
			completion(JSON.stringify({ action: 'rest', reason: '疲労が限界に近いため' })),
		);
		const gateway = new OpenRouterAiDecisionGateway('test-key', 'test/model');

		const result = await gateway.decide(CONTEXT);

		expect(result).toEqual({
			action: 'rest',
			reason: '疲労が限界に近いため',
			model: 'test/model',
		});

		const [url, init] = fetchSpy.mock.calls[0];
		expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions');
		const body = JSON.parse(String(init?.body)) as RequestBody;
		expect(body.model).toBe('test/model');
	});

	it('提示した actions を enum とする JSON Schema を API へ送る', async () => {
		const fetchSpy = stubFetch(async () =>
			completion(JSON.stringify({ action: 'rest', reason: '疲労が限界に近いため' })),
		);
		const gateway = new OpenRouterAiDecisionGateway('test-key', 'test/model');

		await gateway.decide(CONTEXT);

		const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body)) as RequestBody;
		// json_object のままだと action の制約が API へ伝わらず、AI が選択肢外の行動を返せてしまう
		expect(body.response_format?.type).toBe('json_schema');
		expect(body.response_format?.json_schema?.schema.properties.action.enum).toEqual(
			CONTEXT.actions,
		);
		// Structured Output 未対応モデルへ切り替えたときのために prompt にも actions を載せる
		const userMessage = body.messages.find((message) => message.role === 'user');
		expect(userMessage?.content).toContain('continue_driving');
	});

	it('提示していない action を返された場合は例外を投げる', async () => {
		stubFetch(async () =>
			completion(JSON.stringify({ action: 'fly_home', reason: '選択肢外の行動' })),
		);
		const gateway = new OpenRouterAiDecisionGateway('test-key', 'test/model');

		await expect(gateway.decide(CONTEXT)).rejects.toThrow();
	});

	it('JSON として壊れた応答は例外を投げる', async () => {
		stubFetch(async () => completion('休みます'));
		const gateway = new OpenRouterAiDecisionGateway('test-key', 'test/model');

		await expect(gateway.decide(CONTEXT)).rejects.toThrow();
	});

	it('reason が欠けた応答は例外を投げる', async () => {
		stubFetch(async () => completion(JSON.stringify({ action: 'rest' })));
		const gateway = new OpenRouterAiDecisionGateway('test-key', 'test/model');

		await expect(gateway.decide(CONTEXT)).rejects.toThrow();
	});

	it('API がエラーを返した場合は例外を投げる', async () => {
		stubFetch(
			async () =>
				new Response(JSON.stringify({ error: { message: 'invalid api key' } }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' },
				}),
		);
		const gateway = new OpenRouterAiDecisionGateway('test-key', 'test/model');

		await expect(gateway.decide(CONTEXT)).rejects.toThrow();
	});
});
