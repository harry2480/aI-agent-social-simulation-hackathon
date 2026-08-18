import type { SimulationState } from '../models/simulation-state.model';
import type { ReproductionNumberService } from './reproduction-number.service';

export interface CascadeStatus {
	occurred: boolean;
	reach: number;
	depth: number;
	generation: number;
}

/**
 * Sleep Cascade の判定（要件定義 24 章）。
 * 一時的に Rs > 1 になっただけでは Cascade と判定しない。
 */
export class CascadeService {
	constructor(private readonly reproductionNumberService: ReproductionNumberService) {}

	evaluate(state: SimulationState): CascadeStatus {
		const thresholds = state.config.cascadeThresholds;
		const rsSeries = this.reproductionNumberService.rsByGeneration(state);

		let longestStreak = 0;
		let currentStreak = 0;
		for (const rs of rsSeries) {
			if (rs > thresholds.rsThreshold) {
				currentStreak += 1;
				longestStreak = Math.max(longestStreak, currentStreak);
			} else {
				currentStreak = 0;
			}
		}

		const reach = this.cascadeReach(state);
		const reachRate = state.config.population === 0 ? 0 : reach / state.config.population;

		return {
			occurred: longestStreak >= thresholds.minGenerations && reachRate >= thresholds.minReachRate,
			reach,
			depth: this.cascadeDepth(state),
			generation: this.reproductionNumberService.latestGeneration(state),
		};
	}

	/** 伝播によって新規 Sleep-Deprived Case になった Agent の総数 */
	cascadeReach(state: SimulationState): number {
		const reached = new Set<string>();
		for (const transmission of state.transmissions) {
			if (transmission.becameNewCase) {
				reached.add(transmission.toAgentId);
			}
		}
		return reached.size;
	}

	/** 因果チェーン上の最大の深さ */
	cascadeDepth(state: SimulationState): number {
		let depth = 0;
		for (const event of state.events) {
			if (event.depth > depth) {
				depth = event.depth;
			}
		}
		return depth;
	}
}
