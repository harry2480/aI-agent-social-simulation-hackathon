import type {
	AiDecisionGateway,
	DecisionContext,
	DecisionResult,
} from '../../domain/gateways/ai-decision.gateway';

/**
 * 1 回のリクエストを打ち切るまでの時間（ミリ秒）。
 * タイムアウトが無いと応答が返らないまま Tick が止まり、Watch Mode の再生が固まる。
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * ブラウザ（Watch Mode）から使用する AI 意思決定の Gateway 実装。
 * OPENROUTER_API_KEY をクライアントへ露出させないため、必ず Route Handler を経由する。
 */
export class HttpAiDecisionGateway implements AiDecisionGateway {
	constructor(
		private readonly endpoint: string = '/api/agents/decision',
		private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
	) {}

	async decide(context: DecisionContext): Promise<DecisionResult> {
		const response = await fetch(this.endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(context),
			signal: AbortSignal.timeout(this.timeoutMs),
		});

		if (!response.ok) {
			throw new Error(`HttpAiDecisionGateway: request failed with status ${response.status}`);
		}

		return (await response.json()) as DecisionResult;
	}
}
