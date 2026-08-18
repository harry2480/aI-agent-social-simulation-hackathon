import type { DecisionContext } from '../gateways/ai-decision.gateway';
import type { Agent } from '../models/agent.model';

export type DecisionTriggerKind =
	| 'driver_fatigue'
	| 'work_end_overtime'
	| 'delivery_delay'
	| 'household_after_work';

export interface DecisionRequest {
	kind: DecisionTriggerKind;
	context: DecisionContext;
}

/**
 * この疲労を超えた Driver は休憩するか運転継続かの判断を迫られる。
 * 閾値を高くしすぎると判断が勤務時間の後半へ偏り、事故が通勤時間帯の谷間でしか
 * 起きなくなるため、中程度の疲労で判断が発生するようにしている。
 */
const DRIVER_FATIGUE_TRIGGER = 60;

/**
 * AI を呼ぶべき状況かを判定する。
 * 全 Agent を毎 Tick 推論させないためのゲートであり、コスト管理の中核（要件定義 16 章）。
 */
export class DecisionTriggerService {
	/** 判断が必要なら DecisionRequest を返す。不要なら undefined */
	evaluate(
		agent: Agent,
		situation: {
			isDriving: boolean;
			isAtWorkEnd: boolean;
			deliveryDelayMinutes: number;
			isHomeWithHousework: boolean;
			deadlinePressure: number;
		},
	): DecisionRequest | undefined {
		if (situation.isDriving && agent.fatigue >= DRIVER_FATIGUE_TRIGGER) {
			return {
				kind: 'driver_fatigue',
				context: this.buildContext(agent, ['continue_driving', 'rest'], {
					deliveryDelayMinutes: situation.deliveryDelayMinutes,
					deadlinePressure: situation.deadlinePressure,
				}),
			};
		}

		if (situation.isAtWorkEnd) {
			return {
				kind: 'work_end_overtime',
				context: this.buildContext(agent, ['go_home', 'overtime'], {
					deadlinePressure: situation.deadlinePressure,
				}),
			};
		}

		if (situation.deliveryDelayMinutes >= 20) {
			return {
				kind: 'delivery_delay',
				context: this.buildContext(agent, ['prioritize_delivery', 'rest'], {
					deliveryDelayMinutes: situation.deliveryDelayMinutes,
					deadlinePressure: situation.deadlinePressure,
				}),
			};
		}

		if (situation.isHomeWithHousework) {
			return {
				kind: 'household_after_work',
				context: this.buildContext(agent, ['do_housework', 'ask_family', 'sleep'], {
					familyResponsibility: agent.familyResponsibility,
				}),
			};
		}

		return undefined;
	}

	private buildContext(
		agent: Agent,
		actions: readonly string[],
		situation: Record<string, number>,
	): DecisionContext {
		return {
			agent: {
				role: agent.role,
				fatigue: Math.round(agent.fatigue),
				sleepDebt: Number(agent.sleepDebtHours.toFixed(2)),
				responsibility: Number(agent.responsibility.toFixed(2)),
				riskTolerance: Number(agent.riskTolerance.toFixed(2)),
			},
			situation,
			actions,
		};
	}
}
