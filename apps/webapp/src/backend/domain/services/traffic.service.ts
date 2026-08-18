import type { Road } from '../models/city.model';
import type { Congestion, SimulationState } from '../models/simulation-state.model';

/**
 * 1 Tick あたりに解消される混雑（分）。
 * 事故由来の渋滞は数時間規模で残るため、25 分の混雑が約 3 時間かけて解消する速度とする。
 */
const CONGESTION_DECAY_MINUTES_PER_TICK = 2;
/**
 * 事故地点に接続する道路へ波及する混雑の割合。
 * 都市は地区数が少なく道路が密に繋がっているため、波及を強くすると
 * ほぼ全道路が常時渋滞となり、どこが詰まっているかの情報が失われる。
 */
const SPILLOVER_RATE = 0.2;

/**
 * 道路混雑の管理。
 * 混雑エントリは発生原因の Event ID を保持し、遅延を受けた Agent の Event が
 * その ID を参照することで因果を確定させる。
 */
export class TrafficService {
	/** 事故等により道路へ混雑を追加する */
	addCongestion(
		state: SimulationState,
		roadId: string,
		extraMinutes: number,
		causedByEventId: string,
	): void {
		const existing = state.congestions.get(roadId);
		if (existing === undefined) {
			state.congestions.set(roadId, { roadId, extraMinutes, causedByEventId });
			return;
		}
		// より強い混雑が原因として支配的になる
		state.congestions.set(roadId, {
			roadId,
			extraMinutes: existing.extraMinutes + extraMinutes,
			causedByEventId:
				extraMinutes > existing.extraMinutes ? causedByEventId : existing.causedByEventId,
		});
	}

	/**
	 * 事故による混雑を発生道路とその接続道路へ加える。
	 * 交差点で発生した渋滞はそこへ流入する道路にも滞留を生むため、
	 * 影響は 1 本の道路に閉じない。事故が通勤路へ波及する主要経路になる。
	 */
	addAccidentCongestion(
		state: SimulationState,
		road: Road,
		extraMinutes: number,
		causedByEventId: string,
	): Road[] {
		this.addCongestion(state, road.id, extraMinutes, causedByEventId);
		const affected: Road[] = [road];

		for (const candidate of state.city.roads) {
			if (candidate.id === road.id) {
				continue;
			}
			const touches =
				candidate.fromDistrictId === road.fromDistrictId ||
				candidate.toDistrictId === road.fromDistrictId ||
				candidate.fromDistrictId === road.toDistrictId ||
				candidate.toDistrictId === road.toDistrictId;
			if (!touches) {
				continue;
			}
			this.addCongestion(
				state,
				candidate.id,
				Math.round(extraMinutes * SPILLOVER_RATE),
				causedByEventId,
			);
			affected.push(candidate);
		}

		return affected;
	}

	congestionOn(state: SimulationState, roadId: string | undefined): Congestion | undefined {
		if (roadId === undefined) {
			return undefined;
		}
		return state.congestions.get(roadId);
	}

	/** 時間経過による混雑の解消 */
	decay(state: SimulationState): void {
		for (const [roadId, congestion] of [...state.congestions.entries()]) {
			const remaining = congestion.extraMinutes - CONGESTION_DECAY_MINUTES_PER_TICK;
			if (remaining <= 0) {
				state.congestions.delete(roadId);
			} else {
				state.congestions.set(roadId, { ...congestion, extraMinutes: remaining });
			}
		}
	}
}
