import type { Agent } from '../models/agent.model';
import type { InterventionName } from '../models/experiment-config.model';

/** Mandatory Rest が発動する Fatigue 閾値 */
const MANDATORY_REST_FATIGUE = 80;
/**
 * Overtime Limit の上限（Tick 数 = 1 時間）。
 * 既定の残業量（最大 1 時間 45 分）より小さくないと制限が一度も効かず、
 * 介入なしとまったく同じ結果になる。
 */
const OVERTIME_LIMIT_TICKS = 4;
/** Remote Work の対象となる Office Worker の比率 */
const REMOTE_WORK_RATE = 0.5;

/**
 * Policy Intervention の適用（要件定義 32 章）。
 * 効果だけでなく副作用（別 Network を通じた逆効果）も観測対象となるため、
 * 介入は「行動の強制」としてのみ表現し、KPI へ直接手を入れない。
 */
export class InterventionService {
	constructor(private readonly intervention: InterventionName | null) {}

	/** Driver の休憩を強制するか */
	forcesRest(agent: Agent): boolean {
		return (
			this.intervention === 'mandatory_rest' &&
			(agent.role === 'driver' || agent.role === 'delivery_worker') &&
			agent.fatigue >= MANDATORY_REST_FATIGUE
		);
	}

	/** 残業可能な最大 Tick 数 */
	maxOvertimeTicks(): number {
		return this.intervention === 'overtime_limit' ? OVERTIME_LIMIT_TICKS : Number.POSITIVE_INFINITY;
	}

	/** 遅刻分を残業で補填する必要があるか。Flexible Work では不要 */
	requiresLatenessCompensation(): boolean {
		return this.intervention !== 'flexible_work';
	}

	/** 通勤を行わない（リモート勤務）Agent か */
	isRemoteWorker(agent: Agent, indexInPopulation: number): boolean {
		if (this.intervention !== 'remote_work' || agent.role !== 'office_worker') {
			return false;
		}
		return indexInPopulation % Math.round(1 / REMOTE_WORK_RATE) === 0;
	}
}
