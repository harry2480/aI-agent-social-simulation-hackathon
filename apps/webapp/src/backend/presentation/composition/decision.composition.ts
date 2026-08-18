import { DecideAgentActionUseCase } from '../../application/usecases/decide-agent-action.usecase';
import type { AiDecisionGateway } from '../../domain/gateways/ai-decision.gateway';
import { InMemoryDecisionCache } from '../../infrastructure/adapters/in-memory-decision-cache.adapter';
import {
	DEFAULT_AI_MODEL,
	OpenRouterAiDecisionGateway,
} from '../../infrastructure/adapters/openrouter-ai-decision.adapter';
import { RuleBasedAiDecisionGateway } from '../../infrastructure/adapters/rule-based-ai-decision.adapter';

/** OPENROUTER_API_KEY が未設定なら Rule-based 実装へ自動フォールバックする */
function createPrimaryGateway(): AiDecisionGateway {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (apiKey === undefined || apiKey.length === 0) {
		return new RuleBasedAiDecisionGateway();
	}
	return new OpenRouterAiDecisionGateway(apiKey, process.env.AI_MODEL ?? DEFAULT_AI_MODEL);
}

export function createDecideAgentActionUseCase(): DecideAgentActionUseCase {
	return new DecideAgentActionUseCase(
		createPrimaryGateway(),
		new RuleBasedAiDecisionGateway(),
		new InMemoryDecisionCache(),
	);
}

/** Experiment Mode / 再現性検証で使う、AI を呼ばない Gateway */
export function createRuleBasedDecisionGateway(): AiDecisionGateway {
	return new RuleBasedAiDecisionGateway();
}

export function resolveAiModelName(): string {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (apiKey === undefined || apiKey.length === 0) {
		return 'rule-based';
	}
	return process.env.AI_MODEL ?? DEFAULT_AI_MODEL;
}

/** Route Handler（src/app 配下）は domain を直接参照できないため composition 経由で型を渡す */
export type { DecisionContext, DecisionResult } from '../../domain/gateways/ai-decision.gateway';
