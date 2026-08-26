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

	/**
	 * 事故の発生確率。
	 * trafficLevel は ExperimentConfig が 3 以下へ検証するため、最悪条件でも
	 * 0.0015 × 6 × 2.5 × 3 × 1.6 = 約 11% にとどまる。上限で頭を押さえる必要はない。
	 */
	accidentProbability(agent: Agent, trafficLevel: number): number {
		const base = 0.0015;
		return (
			base *
			this.fatigueMultiplier(agent) *
			this.stressMultiplier(agent) *
			Math.max(0.1, trafficLevel) *
			this.riskToleranceMultiplier(agent)
		);
	}

	/**
	 * 作業ミスの発生確率。
	 * Fatigue / Stress は Agent 側で 0〜100 に収まるため、最悪条件でも 0.002 × 6 × 2.5 = 3%
	 * にしかならない。事故と違って外から入る係数が無く、上限で頭を押さえる必要がない。
	 */
	workFailureProbability(agent: Agent): number {
		const base = 0.002;
		return base * this.fatigueMultiplier(agent) * this.stressMultiplier(agent);
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
