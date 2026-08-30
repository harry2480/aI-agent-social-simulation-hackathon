import type { EventDecision, EventType, SimulationEvent } from '../models/simulation-event.model';
import type { SimulationState } from '../models/simulation-state.model';

export interface CausalGraphNode {
	eventId: string;
	type: EventType;
	tick: number;
	actorId: string | undefined;
	depth: number;
	delayMinutes: number | undefined;
	sleepLossMinutes: number | undefined;
	fatigueDelta: number | undefined;
	stressDelta: number | undefined;
	/** AI が選んだ行動とその理由。decision Event 以外では undefined（要件定義 38 章） */
	decision: EventDecision | undefined;
	/** 起点 Event からの距離。負が祖先、正が子孫、0 が起点 */
	distanceFromFocus: number;
}

export interface CausalGraphEdge {
	fromEventId: string;
	toEventId: string;
}

export interface CausalSubgraph {
	focusEventId: string;
	nodes: CausalGraphNode[];
	edges: CausalGraphEdge[];
	/** 打ち切りが発生したか。UI で「一部のみ表示」と示すために使う */
	truncated: boolean;
}

const DEFAULT_MAX_NODES = 60;

/**
 * Causal Graph の部分グラフ抽出。
 *
 * 起点 Event から CausalEdge を両方向へ辿る。エッジは「計算処理が実際に参照した
 * 入力 Event」からのみ生成されているため、ここを辿ることが因果の追跡そのものになる。
 * 全 Event を描画すると数千ノードになるため、起点の近傍だけを取り出す。
 */
export class CausalGraphService {
	/** ある Agent が最初に睡眠不足へ至った Event を起点として選ぶ */
	findFocusEventForAgent(state: SimulationState, agentId: string): SimulationEvent | undefined {
		const deprivedEvent = state.events.find(
			(event) =>
				event.actorId === agentId &&
				(event.type === 'sleep_deprived' || event.type === 'severe_sleep_deprived'),
		);
		if (deprivedEvent !== undefined) {
			return deprivedEvent;
		}
		// 睡眠不足に至っていなければ、直近の睡眠損失 Event を起点にする
		return [...state.events]
			.reverse()
			.find(
				(event) =>
					event.actorId === agentId &&
					(event.type === 'sleep_loss' || event.type === 'sleep_opportunity_loss'),
			);
	}

	buildSubgraph(
		state: SimulationState,
		focusEventId: string,
		options: { maxNodes?: number } = {},
	): CausalSubgraph {
		const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
		const focus = state.eventById(focusEventId);
		if (focus === undefined) {
			return { focusEventId, nodes: [], edges: [], truncated: false };
		}

		const childrenByEventId = this.buildChildIndex(state);
		const distances = new Map<string, number>([[focus.id, 0]]);
		let truncated = false;

		// 祖先方向（原因を遡る）
		truncated = this.traverse(
			state,
			focus,
			distances,
			maxNodes,
			(event) => event.causedByEventIds,
			-1,
		);
		// 子孫方向（影響を辿る）
		truncated =
			this.traverse(
				state,
				focus,
				distances,
				maxNodes,
				(event) => childrenByEventId.get(event.id) ?? [],
				1,
			) || truncated;

		const nodes: CausalGraphNode[] = [];
		for (const [eventId, distance] of distances.entries()) {
			const event = state.eventById(eventId);
			if (event === undefined) {
				continue;
			}
			nodes.push({
				eventId: event.id,
				type: event.type,
				tick: event.tick,
				actorId: event.actorId,
				depth: event.depth,
				delayMinutes: event.impact.delayMinutes,
				sleepLossMinutes: event.impact.sleepLossMinutes,
				fatigueDelta: event.impact.fatigueDelta,
				stressDelta: event.impact.stressDelta,
				decision: event.decision,
				distanceFromFocus: distance,
			});
		}
		nodes.sort((a, b) => a.tick - b.tick || a.eventId.localeCompare(b.eventId));

		const included = new Set(distances.keys());
		const edges: CausalGraphEdge[] = [];
		for (const node of nodes) {
			const event = state.eventById(node.eventId);
			if (event === undefined) {
				continue;
			}
			for (const causeId of event.causedByEventIds) {
				if (included.has(causeId)) {
					edges.push({ fromEventId: causeId, toEventId: event.id });
				}
			}
		}

		return { focusEventId, nodes, edges, truncated };
	}

	/** Event ID → その Event を原因とする Event 群 */
	private buildChildIndex(state: SimulationState): Map<string, string[]> {
		const index = new Map<string, string[]>();
		for (const event of state.events) {
			for (const causeId of event.causedByEventIds) {
				const children = index.get(causeId) ?? [];
				children.push(event.id);
				index.set(causeId, children);
			}
		}
		return index;
	}

	/** 幅優先で辿り、上限に達したら打ち切って true を返す */
	private traverse(
		state: SimulationState,
		focus: SimulationEvent,
		distances: Map<string, number>,
		maxNodes: number,
		nextIds: (event: SimulationEvent) => readonly string[],
		step: number,
	): boolean {
		let frontier = [...nextIds(focus)];
		let distance = step;

		while (frontier.length > 0) {
			if (distances.size >= maxNodes) {
				return true;
			}
			const nextFrontier: string[] = [];
			for (const eventId of frontier) {
				if (distances.has(eventId)) {
					continue;
				}
				if (distances.size >= maxNodes) {
					return true;
				}
				const event = state.eventById(eventId);
				if (event === undefined) {
					continue;
				}
				distances.set(eventId, distance);
				nextFrontier.push(...nextIds(event));
			}
			frontier = nextFrontier;
			distance += step;
		}
		return false;
	}
}
