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
import type { CausalSubgraph } from '@/backend/presentation/composition/watch-mode-engine.composition';
import { EventOriginLegend } from '@/frontend/components/event-origin/event-origin-legend';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import type { CausalNodeDetailRow } from '@/frontend/lib/causal-graph-layout';
import {
	COLUMN_WIDTH,
	causalNodeDetailRows,
	toCausalGraphLayout,
} from '@/frontend/lib/causal-graph-layout';
import { useMemo } from 'react';

interface CausalGraphProps {
	subgraph: CausalSubgraph | null;
	selectedEventId: string | null;
	onSelectEvent: (eventId: string) => void;
}

/**
 * 選択したノードの詳細（要件定義 38 章）。
 * ノードのラベルには収まらない AI の判断理由をここで読ませる。
 */
function CausalNodeDetail({ rows }: { rows: CausalNodeDetailRow[] }) {
	if (rows.length === 0) {
		return (
			<p className="border-t px-4 py-2 text-xs text-muted-foreground">
				ノードを選ぶと、その Event の詳細を表示します。
			</p>
		);
	}

	return (
		<dl className="max-h-32 shrink-0 overflow-y-auto border-t px-4 py-2 text-xs">
			{rows.map((row) => (
				<div key={row.label} className="flex gap-2 py-0.5">
					<dt className="w-32 shrink-0 text-muted-foreground">{row.label}</dt>
					<dd className="min-w-0 break-words">{row.value}</dd>
				</div>
			))}
		</dl>
	);
}

/**
 * Causal Graph。Event をノード、CausalEdge をエッジとして表示する。
 * エッジは「計算処理が実際に参照した入力 Event」からのみ生成されているため、
 * ここを辿ることが因果の追跡そのものになる（要件定義 21・38 章）。
 *
 * ノードの配置とラベルは causal-graph-layout に置き、ここは見た目の適用に絞る。
 */
export function CausalGraph({ subgraph, selectedEventId, onSelectEvent }: CausalGraphProps) {
	const { nodes, edges } = useMemo(() => {
		const layout = toCausalGraphLayout(subgraph);

		const flowNodes: Node[] = layout.nodes.map((node) => {
			const isSelected = node.eventId === selectedEventId;
			return {
				id: node.eventId,
				position: { x: node.x, y: node.y },
				data: { label: node.label },
				style: {
					width: COLUMN_WIDTH - 40,
					fontSize: 10,
					whiteSpace: 'pre-line' as const,
					textAlign: 'left' as const,
					borderWidth: node.isFocus || isSelected ? 2 : 1,
					borderColor: node.isFocus
						? 'var(--color-alert)'
						: isSelected
							? 'var(--color-foreground)'
							: 'var(--color-border)',
					borderStyle: node.borderStyle,
					background: 'var(--color-card)',
					color: 'var(--color-foreground)',
				},
			};
		});

		const flowEdges: Edge[] = layout.edges.map((edge) => ({
			...edge,
			style: { stroke: 'var(--color-muted-foreground)' },
		}));

		return { nodes: flowNodes, edges: flowEdges };
	}, [subgraph, selectedEventId]);

	const detailRows = useMemo(
		() => causalNodeDetailRows(subgraph, selectedEventId),
		[subgraph, selectedEventId],
	);

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
					<div className="flex h-full min-h-0 flex-col">
						<div className="min-h-0 flex-1">
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
						</div>
						<CausalNodeDetail rows={detailRows} />
					</div>
				)}
			</CardContent>
		</Card>
	);
}
