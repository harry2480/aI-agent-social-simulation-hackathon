import type {
	AiDecisionGateway,
	DecisionContext,
	DecisionResult,
} from '../../domain/gateways/ai-decision.gateway';

export const RULE_BASED_MODEL_NAME = 'rule-based';

/**
 * Rule-based の意思決定（要件定義 17 章）。
 * OpenRouter が停止しても Simulation を完走させるための Fallback であり、
 * Experiment Mode（大量 Batch 実行）でも既定でこの実装を使う。
 */
export class RuleBasedAiDecisionGateway implements AiDecisionGateway {
	async decide(context: DecisionContext): Promise<DecisionResult> {
		const { fatigue, riskTolerance, responsibility } = context.agent;
		const deadlinePressure = context.situation.deadlinePressure ?? 0;
		const can = (action: string): boolean => context.actions.includes(action);

		if (fatigue > 85 && riskTolerance < 0.4 && can('rest')) {
			return this.result('rest', '疲労が限界に近く、リスクを避けたため');
		}

		// 責任感やリスク許容度が高い運転者は疲労していても運転を続ける。
		// 「事故リスクのある行動を取るかどうか」の判断であり、事故発生自体は Engine が抽選する
		if (can('continue_driving') && (responsibility > 0.6 || riskTolerance > 0.5)) {
			return this.result('continue_driving', '職業上の責任と配送予定を優先したため');
		}

		if (fatigue > 80 && can('rest')) {
			return this.result('rest', '疲労が強く、休憩を取ったため');
		}

		if (can('continue_driving')) {
			return this.result('continue_driving', '運転を継続できると判断したため');
		}

		if (responsibility > 0.8 && deadlinePressure > 0.7 && can('overtime')) {
			return this.result('overtime', '責任と締切圧力を優先したため');
		}

		// 残業判断の既定は帰宅。ここを fallback 任せにすると全員が毎日残業してしまい、
		// 伝播由来の睡眠不足が自己都合の残業に埋もれる
		if (can('go_home')) {
			return fatigue > 75
				? this.result('go_home', '疲労が強く、帰宅を優先したため')
				: this.result('go_home', '通常どおり退勤したため');
		}

		if (can('do_housework') && context.agent.responsibility > 0.6) {
			return this.result('do_housework', '家庭内の責任を果たすため');
		}

		if (can('sleep') && fatigue > 70) {
			return this.result('sleep', '疲労が強く、睡眠を優先したため');
		}

		const fallback = context.actions[0];
		if (fallback === undefined) {
			throw new Error('RuleBasedAiDecisionGateway: actions is empty');
		}
		return this.result(fallback, '既定行動を継続したため');
	}

	private result(action: string, reason: string): DecisionResult {
		return { action, reason, model: RULE_BASED_MODEL_NAME };
	}
}
