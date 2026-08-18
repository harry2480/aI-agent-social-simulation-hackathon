export type EventType =
	| 'decision'
	| 'accident'
	| 'traffic_jam'
	| 'commute_delay'
	| 'late_arrival'
	| 'work_delay'
	| 'work_failure'
	| 'overtime'
	| 'delivery_delay'
	| 'store_delay'
	| 'household_delay'
	| 'sleep_opportunity_loss'
	| 'sleep_loss'
	| 'sleep_deprived'
	| 'severe_sleep_deprived'
	| 'recovery';

/** 同一 Tick 内での無限連鎖を防ぐための伝播 Depth 上限（要件定義 11 章） */
export const MAX_EVENT_DEPTH = 10;

export interface EventImpact {
	delayMinutes?: number;
	sleepLossMinutes?: number;
	fatigueDelta?: number;
	stressDelta?: number;
}

/**
 * UI 上で重要 Event として優先表示し、DB へ保存する種別。
 *
 * decision は毎日ほぼ全 Agent で発生するため含めない。
 * 含めると Timeline が Decision で埋まって事故・遅延・伝播が見えなくなり、
 * 保存件数も Population × Days のオーダーで膨らむ。
 * AI の判断内容は Agent Detail の Last AI Decision と agent_decisions テーブルで参照する。
 */
const SIGNIFICANT_EVENT_TYPES: ReadonlySet<EventType> = new Set<EventType>([
	'accident',
	'traffic_jam',
	'commute_delay',
	'late_arrival',
	'work_failure',
	'work_delay',
	'overtime',
	'household_delay',
	'sleep_opportunity_loss',
	'sleep_loss',
	'sleep_deprived',
	'severe_sleep_deprived',
]);

/**
 * Simulation 内で発生した出来事。
 * causedByEventIds には「この Event の計算処理が実際に参照した入力 Event」のみを入れる。
 * 時間的に直前に起きただけの Event を原因として登録してはならない（要件定義 21 章）。
 */
export class SimulationEvent {
	private constructor(
		public readonly id: string,
		public readonly tick: number,
		public readonly type: EventType,
		public readonly actorId: string | undefined,
		public readonly targetIds: readonly string[],
		public readonly causedByEventIds: readonly string[],
		public readonly impact: EventImpact,
		/** 因果チェーン上の深さ。Patient Zero 起点の Event が 0 */
		public readonly depth: number,
	) {}

	static create(params: {
		id: string;
		tick: number;
		type: EventType;
		actorId?: string;
		targetIds?: readonly string[];
		causes?: readonly SimulationEvent[];
		impact?: EventImpact;
	}): SimulationEvent {
		const causes = params.causes ?? [];
		const depth = causes.length === 0 ? 0 : Math.max(...causes.map((cause) => cause.depth)) + 1;

		return new SimulationEvent(
			params.id,
			params.tick,
			params.type,
			params.actorId,
			params.targetIds ?? [],
			causes.map((cause) => cause.id),
			params.impact ?? {},
			depth,
		);
	}

	static reconstruct(params: {
		id: string;
		tick: number;
		type: EventType;
		actorId?: string;
		targetIds: readonly string[];
		causedByEventIds: readonly string[];
		impact: EventImpact;
		depth: number;
	}): SimulationEvent {
		return new SimulationEvent(
			params.id,
			params.tick,
			params.type,
			params.actorId,
			params.targetIds,
			params.causedByEventIds,
			params.impact,
			params.depth,
		);
	}

	/** 伝播 Depth 上限に達しており、これ以上連鎖させてはならないか */
	get isAtMaxDepth(): boolean {
		return this.depth >= MAX_EVENT_DEPTH;
	}

	get isSignificant(): boolean {
		return SIGNIFICANT_EVENT_TYPES.has(this.type);
	}
}
