import type { SimulationEvent } from '../models/simulation-event.model';
import type { SimulationState } from '../models/simulation-state.model';
import { isSleepDeprivedState } from '../models/sleep-state.model';

/** Sleep Transmission 候補とみなす睡眠機会損失の下限（分）。要件定義 22 章 */
export const SLEEP_TRANSMISSION_THRESHOLD_MINUTES = 30;

/**
 * 他 Agent 由来の Causal Chain によって発生した睡眠機会損失を Sleep Transmission として記録する。
 * 因果チェーンは CausalEdge（＝計算処理が実際に参照した入力 Event）だけを辿るため、
 * 時間的に近いだけの Event が伝播元として誤登録されることはない。
 */
export class SleepTransmissionService {
	/**
	 * 睡眠機会損失 Event から伝播元 Agent を特定し、Sleep Transmission 候補として記録する。
	 *
	 * ここでは状態遷移を確定させない。睡眠機会損失が発生した時点ではまだ Sleep Debt が
	 * 更新されておらず、New Sleep-Deprived Case かどうかを判定できないため。
	 * 判定は起床時（Sleep Debt 確定後）の commitNightTransition で行う。
	 */
	detect(state: SimulationState, lossEvent: SimulationEvent, sleepLossMinutes: number): void {
		if (sleepLossMinutes < SLEEP_TRANSMISSION_THRESHOLD_MINUTES) {
			return;
		}
		const victimId = lossEvent.actorId;
		if (victimId === undefined) {
			return;
		}

		const sourceId = this.findUpstreamActor(state, lossEvent, victimId);
		if (sourceId === undefined) {
			return;
		}

		state.transmissions.push({
			fromAgentId: sourceId,
			toAgentId: victimId,
			tick: lossEvent.tick,
			sleepLossMinutes,
			causeEventId: lossEvent.id,
			becameNewCase: false,
		});
	}

	/**
	 * 起床時に Sleep Debt 確定後の状態遷移を評価する。
	 * Normal / Tired から Sleep Deprived 以上へ遷移した場合、
	 * 直近の未確定の伝播候補を New Sleep-Deprived Case として確定し、Generation を割り当てる。
	 * 伝播候補が無い場合は自然発生ケースとして Generation 0 に置く。
	 */
	commitNightTransition(state: SimulationState, agentId: string): boolean {
		const agent = state.agent(agentId);
		const becameNewCase = agent.commitSleepStateTransition(state.config.sleepStateThresholds);
		if (!becameNewCase) {
			return false;
		}

		for (let i = state.transmissions.length - 1; i >= 0; i--) {
			const transmission = state.transmissions[i];
			if (
				transmission === undefined ||
				transmission.toAgentId !== agentId ||
				transmission.becameNewCase
			) {
				continue;
			}

			transmission.becameNewCase = true;

			// 伝播元自身が睡眠不足ケースでない場合、この Agent は「他のケース由来」ではないため
			// 起点（Generation 0）として扱う。
			// 伝播元を無条件に Generation 0 へ登録すると、ケースでない Agent が
			// Rs の分母（Generation g の Agent 数）へ混入して Rs が過小評価される
			const sourceGeneration = state.generations.get(transmission.fromAgentId);
			// 既に世代が確定している Agent は上書きしない（最初にケース化した世代を保持する）
			if (!state.generations.has(agentId)) {
				state.generations.set(agentId, sourceGeneration === undefined ? 0 : sourceGeneration + 1);
			}
			return true;
		}

		if (!state.generations.has(agentId)) {
			state.generations.set(agentId, 0);
		}
		return true;
	}

	/**
	 * 因果チェーンを遡り、被害者本人以外で最初に見つかる actor を伝播元とする。
	 * 幅優先で探索し、深さは Event の depth により自然に有界となる。
	 */
	private findUpstreamActor(
		state: SimulationState,
		lossEvent: SimulationEvent,
		victimId: string,
	): string | undefined {
		const visited = new Set<string>([lossEvent.id]);
		let frontier = [...lossEvent.causedByEventIds];

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
				if (event.actorId !== undefined && event.actorId !== victimId) {
					return event.actorId;
				}
				nextFrontier.push(...event.causedByEventIds);
			}
			frontier = nextFrontier;
		}

		return undefined;
	}

	/** 現在の Sleep-Deprived 人口 */
	deprivedPopulation(state: SimulationState): number {
		let count = 0;
		for (const agent of state.agents.values()) {
			if (isSleepDeprivedState(agent.sleepState(state.config.sleepStateThresholds))) {
				count += 1;
			}
		}
		return count;
	}
}
