import { type NetworkName, networkOfEventType } from '../models/simulation-event.model';
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

	/**
	 * ある Agent を起点として、伝播の連鎖で新規ケースになった Agent 数を返す。
	 *
	 * cascadeReach は Run 全体の指標なので、Patient Zero ごとの伝播力を比べる用途には使えない
	 * （背景で自然発生したケースまで数えてしまう）。この指標は伝播グラフを起点から辿るため、
	 * その Agent に帰属する広がりだけを数える。
	 */
	reachFrom(state: SimulationState, sourceAgentId: string): number {
		const reached = new Set<string>();
		let frontier = [sourceAgentId];

		while (frontier.length > 0) {
			const nextFrontier: string[] = [];
			for (const agentId of frontier) {
				for (const transmission of state.transmissions) {
					if (
						transmission.fromAgentId !== agentId ||
						!transmission.becameNewCase ||
						reached.has(transmission.toAgentId) ||
						transmission.toAgentId === sourceAgentId
					) {
						continue;
					}
					reached.add(transmission.toAgentId);
					nextFrontier.push(transmission.toAgentId);
				}
			}
			frontier = nextFrontier;
		}

		return reached.size;
	}

	/**
	 * ある Agent が他 Agent へ 30 分以上の睡眠機会損失を与えた回数。
	 *
	 * 新規ケース化は Sleep Debt が閾値を越えて初めて成立するため、短い期間では
	 * ほとんど 0 になり伝播力の差が見えない。Sleep Loss と New Case は別指標として
	 * 扱う（要件定義 22 章）ため、こちらを伝播力の density 指標として併用する。
	 */
	transmissionCountFrom(state: SimulationState, sourceAgentId: string): number {
		return state.transmissions.filter((transmission) => transmission.fromAgentId === sourceAgentId)
			.length;
	}

	/**
	 * ある Agent を起点とした伝播が、いくつの Network を横断したかを返す。
	 *
	 * 伝播が成立した Causal Chain を遡り、通過した Event がどの Network の
	 * 出来事かを集める。職業だけでなく「複数 Network の境界にいる Agent が
	 * Super-spreader になるか」を測るための指標（要件定義 31 章）。
	 *
	 * 新規ケースになった伝播だけに絞ると、短い期間ではほとんど 0 件になり
	 * 横断の有無が判定できないため、睡眠機会損失を与えた伝播すべてを対象にする。
	 */
	networksTraversedFrom(state: SimulationState, sourceAgentId: string): NetworkName[] {
		const networks = new Set<NetworkName>();

		for (const transmission of state.transmissions) {
			if (transmission.fromAgentId !== sourceAgentId) {
				continue;
			}

			const visited = new Set<string>();
			let frontier = [transmission.causeEventId];
			while (frontier.length > 0) {
				const nextFrontier: string[] = [];
				for (const eventId of frontier) {
					if (visited.has(eventId)) {
						continue;
					}
					visited.add(eventId);

					const event = state.eventById(eventId);
					if (event === undefined) {
						continue;
					}
					const network = networkOfEventType(event.type);
					if (network !== undefined) {
						networks.add(network);
					}
					nextFrontier.push(...event.causedByEventIds);
				}
				frontier = nextFrontier;
			}
		}

		return [...networks].sort();
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
