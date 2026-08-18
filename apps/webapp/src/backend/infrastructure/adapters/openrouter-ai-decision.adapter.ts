import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject } from 'ai';
import { z } from 'zod';
import type {
	AiDecisionGateway,
	DecisionContext,
	DecisionResult,
} from '../../domain/gateways/ai-decision.gateway';

export const DEFAULT_AI_MODEL = 'google/gemma-3-27b-it';

const SYSTEM_PROMPT = `あなたはSLEEP CITYという仮想都市に住む一人の住民です。

あなたは都市全体の状態を知りません。
与えられた自分自身の状態、現在の状況、性格、職業上の責任だけを使って判断してください。

都市全体を最適化しようとしてはいけません。
現実の人間として自然な意思決定をしてください。

必ず提示されたactionsの中から1つだけ選んでください。

出力は指定されたJSON形式のみとしてください。`;

/**
 * OpenRouter 経由の AI 意思決定。
 * Structured Output のスキーマで action を提示された選択肢に制約し、
 * AI が自由な action を生成することを禁止する（要件定義 14 章）。
 */
export class OpenRouterAiDecisionGateway implements AiDecisionGateway {
	private readonly provider: ReturnType<typeof createOpenAICompatible>;

	constructor(
		apiKey: string,
		private readonly model: string = DEFAULT_AI_MODEL,
	) {
		this.provider = createOpenAICompatible({
			name: 'openrouter',
			baseURL: 'https://openrouter.ai/api/v1',
			apiKey,
		});
	}

	async decide(context: DecisionContext): Promise<DecisionResult> {
		const actions = context.actions;
		if (actions.length === 0) {
			throw new Error('OpenRouterAiDecisionGateway: actions is empty');
		}

		const schema = z.object({
			action: z.enum(actions as unknown as [string, ...string[]]),
			reason: z.string(),
		});

		const { object } = await generateObject({
			model: this.provider(this.model),
			system: SYSTEM_PROMPT,
			schema,
			prompt: JSON.stringify({ agent: context.agent, situation: context.situation }),
		});

		return { action: object.action, reason: object.reason, model: this.model };
	}
}
