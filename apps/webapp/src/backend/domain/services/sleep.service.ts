import type { Agent } from '../models/agent.model';
import { MINUTES_PER_TICK } from '../models/simulation-clock.model';

/** 睡眠超過分から Sleep Debt を回復させる割合 */
const DEFAULT_RECOVERY_RATE = 0.5;

/**
 * Sleep / Sleep Debt の更新。
 * Daily Sleep Deficit = max(0, Sleep Need - Actual Sleep)
 * Sleep Debt(t+1) = Sleep Debt(t) + Daily Sleep Deficit - Recovery
 */
export class SleepService {
	constructor(private readonly recoveryRate: number = DEFAULT_RECOVERY_RATE) {}

	/** 睡眠中の Agent に 1 Tick 分の睡眠を記録する */
	applyTick(agent: Agent): void {
		if (agent.currentAction === 'sleeping') {
			agent.recordSleepMinutes(MINUTES_PER_TICK);
		}
	}

	/** 起床時にその晩の Sleep Debt を確定する */
	closeNight(agent: Agent): { deficitHours: number; recoveredHours: number } {
		return agent.applyNightSleep(this.recoveryRate);
	}
}
