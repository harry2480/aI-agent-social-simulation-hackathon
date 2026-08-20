'use client';

import {
	Background,
	Controls,
	type Edge,
	type Node,
	type NodeMouseHandler,
	ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {
	CausalGraphNode,
	CausalSubgraph,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import { EventOriginLegend } from '@/frontend/components/event-origin/event-origin-legend';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { eventTypePresentation } from '@/frontend/lib/event-origin-presentation';
import { formatEventLabel, formatTickLabel } from '@/frontend/lib/format';
import { useMemo } from 'react';

interface CausalGraphProps {
	subgraph: CausalSubgraph | null;
	selectedEventId: string | null;
	onSelectEvent: (eventId: string) => void;
}

/** 横方向は起点からの距離、縦方向は同じ距離のノードを並べる */
const COLUMN_WIDTH = 220;
const ROW_HEIGHT = 78;

function nodeLabel(node: CausalGraphNode): string {
	const origin = eventTypePresentation(node.type);
	const impact =
		node.sleepLossMinutes !== undefined
			? ` sleep -${node.sleepLossMinutes}min`
			: node.delayMinutes !== undefined
				? ` +${node.delayMinutes}min`
				: '';
	// AI 判断ノードと確率イベントノードを取り違えると因果の読み方を誤るため、由来を先頭に出す
	return `${origin.marker} ${formatEventLabel(node.type)}\n${formatTickLabel(node.tick)}${impact}\n${node.actorId ?? '-'}`;
}

/**
 * Causal Graph。Event をノード、CausalEdge をエッジとして表示する。
 * エッジは「計算処理が実際に参照した入力 Event」からのみ生成されているため、
 * ここを辿ることが因果の追跡そのものになる（要件定義 21・38 章）。
 */
export function CausalGraph({ subgraph, selectedEventId, onSelectEvent }: CausalGraphProps) {
	const { nodes, edges } = useMemo(() => {
		if (subgraph === null) {
			return { nodes: [] as Node[], edges: [] as Edge[] };
		}

		const rowByColumn = new Map<number, number>();
		const flowNodes: Node[] = subgraph.nodes.map((node) => {
			const column = node.distanceFromFocus;
			const row = rowByColumn.get(column) ?? 0;
			rowByColumn.set(column, row + 1);

			const isFocus = node.distanceFromFocus === 0;
			const isSelected = node.eventId === selectedEventId;
			return {
				id: node.eventId,
				position: { x: column * COLUMN_WIDTH, y: row * ROW_HEIGHT },
				data: { label: nodeLabel(node) },
				style: {
					width: COLUMN_WIDTH - 40,
					fontSize: 10,
					whiteSpace: 'pre-line' as const,
					textAlign: 'left' as const,
					borderWidth: isFocus || isSelected ? 2 : 1,
					borderColor: isFocus
						? 'var(--color-alert)'
						: isSelected
							? 'var(--color-foreground)'
							: 'var(--color-border)',
					// 由来ごとに枠線の種類を変える。色だけに頼らない（docs/スタイルガイド.md）
					borderStyle: eventTypePresentation(node.type).graphBorderStyle,
					background: 'var(--color-card)',
					color: 'var(--color-foreground)',
				},
			};
		});

		const flowEdges: Edge[] = subgraph.edges.map((edge) => ({
			id: `${edge.fromEventId}->${edge.toEventId}`,
			source: edge.fromEventId,
			target: edge.toEventId,
			style: { stroke: 'var(--color-muted-foreground)' },
		}));

		return { nodes: flowNodes, edges: flowEdges };
	}, [subgraph, selectedEventId]);

	const handleNodeClick: NodeMouseHandler = (_event, node) => {
		onSelectEvent(node.id);
	};

	return (
		<Card className="flex min-h-0 flex-col">
			<CardHeader className="pb-2">
				<CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
					<span>Causal Graph</span>
					<EventOriginLegend />
					{subgraph?.truncated === true ? (
						<span className="text-xs font-normal text-muted-foreground">
							（ノード数上限のため一部のみ表示）
						</span>
					) : null}
				</CardTitle>
			</CardHeader>
			<CardContent className="min-h-0 flex-1 p-0">
				{subgraph === null || subgraph.nodes.length === 0 ? (
					<p className="px-4 pb-4 text-xs text-muted-foreground">
						Timeline か City Map から Agent / Event を選ぶと、その因果連鎖を表示します。
					</p>
				) : (
					<ReactFlow
						nodes={nodes}
						edges={edges}
						onNodeClick={handleNodeClick}
						fitView
						proOptions={{ hideAttribution: true }}
						nodesDraggable={false}
						nodesConnectable={false}
					>
						<Background />
						<Controls showInteractive={false} />
					</ReactFlow>
				)}
			</CardContent>
		</Card>
	);
}
