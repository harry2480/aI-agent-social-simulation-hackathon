import type { SimulationState } from '../models/simulation-state.model';

/**
 * SLEEP CITY 独自指標 Rs（Sleep Reproduction Number）の算出（要件定義 23 章）。
 * 感染症疫学上の R0 そのものではないため、UI・発表資料では区別して表示する。
 */
export class ReproductionNumberService {
	/** Agent A が原因となった新規 Sleep-Deprived Agent 数 */
	individualRs(state: SimulationState, agentId: string): number {
		return state.transmissions.filter(
			(transmission) => transmission.fromAgentId === agentId && transmission.becameNewCase,
		).length;
	}

	/**
	 * Generation g が発生させた次 Generation の新規ケース数 / Generation g の Agent 数。
	 * Generation g に属する Agent が 0 の場合は 0 を返す。
	 */
	generationRs(state: SimulationState, generation: number): number {
		const generationAgents = this.agentsInGeneration(state, generation);
		if (generationAgents.length === 0) {
			return 0;
		}

		const generationAgentIds = new Set(generationAgents);
		const newCases = state.transmissions.filter(
			(transmission) =>
				transmission.becameNewCase &&
				generationAgentIds.has(transmission.fromAgentId) &&
				state.generations.get(transmission.toAgentId) === generation + 1,
		).length;

		return newCases / generationAgents.length;
	}

	/** 現時点で最も新しい（＝末端の）Generation の Rs */
	currentRs(state: SimulationState): number {
		const latest = this.latestGeneration(state);
		// 末端 Generation はまだ次世代を生んでいないため、その 1 つ前を Current とする
		const target = Math.max(0, latest - 1);
		return this.generationRs(state, target);
	}

	/** 全 Generation の Rs 系列 */
	rsByGeneration(state: SimulationState): number[] {
		const latest = this.latestGeneration(state);
		const series: number[] = [];
		for (let generation = 0; generation <= latest; generation++) {
			series.push(this.generationRs(state, generation));
		}
		return series;
	}

	latestGeneration(state: SimulationState): number {
		let latest = 0;
		for (const generation of state.generations.values()) {
			if (generation > latest) {
				latest = generation;
			}
		}
		return latest;
	}

	agentsInGeneration(state: SimulationState, generation: number): string[] {
		const result: string[] = [];
		for (const [agentId, agentGeneration] of state.generations.entries()) {
			if (agentGeneration === generation) {
				result.push(agentId);
			}
		}
		return result.sort((a, b) => a.localeCompare(b));
	}
}
