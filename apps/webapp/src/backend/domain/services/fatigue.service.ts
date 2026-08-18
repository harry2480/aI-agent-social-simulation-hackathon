import type { Agent } from '../models/agent.model';

/** 1 Tick(15 分) あたりの基準変化量 */
const WORK_FATIGUE_PER_TICK = 0.9;
const OVERTIME_FATIGUE_PER_TICK = 1.6;
const DRIVING_FATIGUE_PER_TICK = 1.4;
const COMMUTE_FATIGUE_PER_TICK = 0.5;
const HOUSEWORK_FATIGUE_PER_TICK = 0.7;
const REST_FATIGUE_PER_TICK = -1.5;
const SLEEP_FATIGUE_PER_TICK = -2.2;

const OVERTIME_STRESS_PER_TICK = 0.8;
const WORK_STRESS_PER_TICK = 0.2;
const SLEEP_STRESS_PER_TICK = -1.0;
const REST_STRESS_PER_TICK = -0.6;

/**
 * Fatigue / Stress の更新。Sleep Debt が大きいほど疲労の蓄積が速くなる。
 * AI ではなく Simulation Engine が決定する（要件定義 12.2）。
 */
export class FatigueService {
	/** 1 Tick 分の Fatigue / Stress を更新する */
	applyTick(agent: Agent): void {
		// Sleep Debt 1 時間ごとに疲労蓄積が 12% 増える
		const debtMultiplier = 1 + agent.sleepDebtHours * 0.12;

		switch (agent.currentAction) {
			case 'working':
				agent.addFatigue(WORK_FATIGUE_PER_TICK * debtMultiplier);
				agent.addStress(WORK_STRESS_PER_TICK);
				break;
			case 'overtime':
				agent.addFatigue(OVERTIME_FATIGUE_PER_TICK * debtMultiplier);
				agent.addStress(OVERTIME_STRESS_PER_TICK);
				break;
			case 'driving':
			case 'delivering':
				agent.addFatigue(DRIVING_FATIGUE_PER_TICK * debtMultiplier);
				agent.addStress(WORK_STRESS_PER_TICK);
				break;
			case 'commuting':
				agent.addFatigue(COMMUTE_FATIGUE_PER_TICK * debtMultiplier);
				break;
			case 'housework':
			case 'shopping':
				agent.addFatigue(HOUSEWORK_FATIGUE_PER_TICK * debtMultiplier);
				break;
			case 'resting':
				agent.addFatigue(REST_FATIGUE_PER_TICK);
				agent.addStress(REST_STRESS_PER_TICK);
				break;
			case 'sleeping':
				// Sleep Debt が大きいほど睡眠の回復効率が落ちる。
				// これが無いと 1 晩の睡眠で疲労が完全にリセットされ、疲労が蓄積しない
				agent.addFatigue(SLEEP_FATIGUE_PER_TICK / (1 + agent.sleepDebtHours * 0.25));
				agent.addStress(SLEEP_STRESS_PER_TICK);
				break;
			case 'morning_routine':
			case 'idle':
				break;
		}
	}

	/** 遅延・失敗などの Event 影響を反映する */
	applyImpact(agent: Agent, fatigueDelta: number, stressDelta: number): void {
		agent.addFatigue(fatigueDelta);
		agent.addStress(stressDelta);
	}
}
