import type { Agent } from '../models/agent.model';
import type { SeededRandomService } from './seeded-random.service';

/**
 * 事故・作業ミスの確率算出。AI ではなく Simulation Engine が決定する（要件定義 19 章）。
 *
 * Event Probability = Base × Fatigue × Stress × Environment × Action
 *
 * AI は「事故を起こすか」ではなく「事故リスクのある行動を取るか」を決める。
 */
export class ProbabilisticEventService {
	constructor(private readonly rng: SeededRandomService) {}

	/** 運転継続時の事故発生判定。1 Tick あたり */
	rollAccident(
		agent: Agent,
		params: { trafficLevel: number; riskyActionChosen: boolean },
	): boolean {
		if (!params.riskyActionChosen) {
			return false;
		}
		return this.rng.bool(this.accidentProbability(agent, params.trafficLevel));
	}

	/** 作業ミスの発生判定 */
	rollWorkFailure(agent: Agent): boolean {
		return this.rng.bool(this.workFailureProbability(agent));
	}

	accidentProbability(agent: Agent, trafficLevel: number): number {
		const base = 0.0015;
		return Math.min(
			0.4,
			base *
				this.fatigueMultiplier(agent) *
				this.stressMultiplier(agent) *
				Math.max(0.1, trafficLevel) *
				this.riskToleranceMultiplier(agent),
		);
	}

	workFailureProbability(agent: Agent): number {
		const base = 0.002;
		return Math.min(0.4, base * this.fatigueMultiplier(agent) * this.stressMultiplier(agent));
	}

	/** 疲労 0 で 1 倍、疲労 100 で 6 倍 */
	private fatigueMultiplier(agent: Agent): number {
		return 1 + (agent.fatigue / 100) * 5;
	}

	/** ストレス 0 で 1 倍、100 で 2.5 倍 */
	private stressMultiplier(agent: Agent): number {
		return 1 + (agent.stress / 100) * 1.5;
	}

	/** リスク許容度が高いほど事故率が上がる */
	private riskToleranceMultiplier(agent: Agent): number {
		return 0.7 + agent.riskTolerance * 0.9;
	}
}
