import type {
	CausalGraphNode,
	CausalSubgraph,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import { eventTypePresentation } from '@/frontend/lib/event-origin-presentation';
import { formatEventLabel, formatTickLabel } from '@/frontend/lib/format';

/** 横方向は起点からの距離、縦方向は同じ距離のノードを並べる */
export const COLUMN_WIDTH = 220;
export const ROW_HEIGHT = 78;

export interface CausalNodeLayout {
	eventId: string;
	label: string;
	x: number;
	y: number;
	/** 因果を辿る起点そのもの。枠を強調する */
	isFocus: boolean;
	/** Timeline などから選択されているノード */
	isSelected: boolean;
	/** 由来ごとに変える枠線の種類。色だけに頼らない（docs/スタイルガイド.md） */
	borderStyle: string;
}

export interface CausalEdgeLayout {
	id: string;
	source: string;
	target: string;
}

/**
 * ノードの表示ラベル。
 * AI 判断ノードと確率イベントノードを取り違えると因果の読み方を誤るため、由来を先頭に出す。
 */
export function causalNodeLabel(node: CausalGraphNode): string {
	const origin = eventTypePresentation(node.type);
	const impact =
		node.sleepLossMinutes !== undefined
			? ` sleep -${node.sleepLossMinutes}min`
			: node.delayMinutes !== undefined
				? ` +${node.delayMinutes}min`
				: '';

	return `${origin.marker} ${formatEventLabel(node.type)}\n${formatTickLabel(node.tick)}${impact}\n${node.actorId ?? '-'}`;
}

/**
 * 部分グラフを描画位置へ変換する。
 *
 * 起点からの距離を列、同じ列に現れた順を行に割り当てる。
 * distanceFromFocus は負が祖先・正が子孫なので、原因が左・結果が右に並ぶ。
 */
export function toCausalGraphLayout(subgraph: CausalSubgraph | null): {
	nodes: Omit<CausalNodeLayout, 'isSelected'>[];
	edges: CausalEdgeLayout[];
} {
	if (subgraph === null) {
		return { nodes: [], edges: [] };
	}

	const rowByColumn = new Map<number, number>();
	const nodes = subgraph.nodes.map((node) => {
		const column = node.distanceFromFocus;
		const row = rowByColumn.get(column) ?? 0;
		rowByColumn.set(column, row + 1);

		return {
			eventId: node.eventId,
			label: causalNodeLabel(node),
			x: column * COLUMN_WIDTH,
			y: row * ROW_HEIGHT,
			isFocus: node.distanceFromFocus === 0,
			borderStyle: eventTypePresentation(node.type).graphBorderStyle,
		};
	});

	const edges = subgraph.edges.map((edge) => ({
		id: `${edge.fromEventId}->${edge.toEventId}`,
		source: edge.fromEventId,
		target: edge.toEventId,
	}));

	return { nodes, edges };
}
