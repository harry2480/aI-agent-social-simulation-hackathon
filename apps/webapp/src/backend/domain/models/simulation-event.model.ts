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

/**
 * 同一 Tick 内での無限連鎖を防ぐための伝播 Depth 上限（要件定義 11 章）。
 *
 * 制限するのは「1 Tick の中で連鎖が際限なく広がること」であり、
 * 日をまたいで積み上がる因果チェーン全体の長さではない。
 * 数日かけて伸びたチェーンの depth はこの値を超えてよい。
 */
export const MAX_EVENT_DEPTH = 10;

/** 都市内の Network 種別（要件定義 5 章） */
export type NetworkName = 'transportation' | 'work' | 'household';

const NETWORK_BY_EVENT_TYPE: Partial<Record<EventType, NetworkName>> = {
	accident: 'transportation',
	traffic_jam: 'transportation',
	commute_delay: 'transportation',
	late_arrival: 'transportation',
	work_delay: 'work',
	work_failure: 'work',
	overtime: 'work',
	delivery_delay: 'work',
	store_delay: 'work',
	household_delay: 'household',
};

/**
 * その Event がどの Network 上の出来事かを返す。
 * どの Network にも属さない Event（睡眠・判断など）は undefined。
 */
export function networkOfEventType(type: EventType): NetworkName | undefined {
	return NETWORK_BY_EVENT_TYPE[type];
}

/**
 * その Event が何によって決まったか（要件定義 19 章）。
 *
 * - ai_decision: AI が選んだ行動そのもの
 * - probabilistic: Simulation Engine の確率抽選で発生した出来事
 * - deterministic: 遅延時間や睡眠時間の計算結果として必然的に発生した出来事
 *
 * AI は「事故を起こすか」ではなく「事故リスクのある行動を取るか」を決める。
 * UI 側でこの区別を示さないと、事故を AI が起こしたものと誤読される。
 */
export type EventOrigin = 'ai_decision' | 'probabilistic' | 'deterministic';

const ORIGIN_BY_EVENT_TYPE: Partial<Record<EventType, EventOrigin>> = {
	decision: 'ai_decision',
	// 抽選を経て発生するのはこの 2 種のみ。traffic_jam は事故発生後に必ず起きる
	accident: 'probabilistic',
	work_failure: 'probabilistic',
};

export function originOfEventType(type: EventType): EventOrigin {
	return ORIGIN_BY_EVENT_TYPE[type] ?? 'deterministic';
}

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
	'delivery_delay',
	'store_delay',
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

	/** 同一 Tick 内での伝播上限に達しており、これ以上連鎖させてはならないか */
	get isAtMaxDepth(): boolean {
		return this.depth >= MAX_EVENT_DEPTH;
	}

	get isSignificant(): boolean {
		return SIGNIFICANT_EVENT_TYPES.has(this.type);
	}

	/** この Event が AI 判断・確率抽選・決定論的計算のどれで決まったか */
	get origin(): EventOrigin {
		return originOfEventType(this.type);
	}
}
