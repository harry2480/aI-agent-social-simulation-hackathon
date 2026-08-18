import type {
	AiDecisionGateway,
	DecisionContext,
	DecisionResult,
} from '../../domain/gateways/ai-decision.gateway';
import {
	type DecisionCacheGateway,
	decisionContextKey,
} from '../../domain/gateways/decision-cache.gateway';

/**
 * Cache → AI → Fallback の順に意思決定を解決する。
 * AI 呼び出しの失敗・Structured Output 形式不正はここで捕捉し、Simulation を止めない。
 *
 * domain の AiDecisionGateway を実装しているため、Simulation Engine へそのまま注入できる。
 */
export class DecideAgentActionUseCase implements AiDecisionGateway {
	private aiFailureCount = 0;

	constructor(
		private readonly aiGateway: AiDecisionGateway,
		private readonly fallbackGateway: AiDecisionGateway,
		private readonly cache: DecisionCacheGateway,
	) {}

	async decide(context: DecisionContext): Promise<DecisionResult> {
		const key = decisionContextKey(context);

		const cached = this.cache.get(key);
		if (cached !== undefined) {
			return cached;
		}

		try {
			const result = await this.aiGateway.decide(context);
			if (!context.actions.includes(result.action)) {
				throw new Error(`DecideAgentActionUseCase: unexpected action ${result.action}`);
			}
			this.cache.set(key, result);
			return result;
		} catch {
			this.aiFailureCount += 1;
			const fallback = await this.fallbackGateway.decide(context);
			this.cache.set(key, fallback);
			return fallback;
		}
	}

	/** OpenRouter 呼び出しが失敗して Fallback へ切り替わった回数 */
	get failureCount(): number {
		return this.aiFailureCount;
	}
}
