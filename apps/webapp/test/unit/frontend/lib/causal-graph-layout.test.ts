import type {
	CausalGraphNode,
	CausalSubgraph,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import {
	COLUMN_WIDTH,
	ROW_HEIGHT,
	causalNodeLabel,
	toCausalGraphLayout,
} from '@/frontend/lib/causal-graph-layout';
import { describe, expect, it } from 'vitest';

function node(overrides: Partial<CausalGraphNode> = {}): CausalGraphNode {
	return {
		eventId: 'e1',
		type: 'commute_delay',
		tick: 0,
		actorId: 'agent-0000',
		depth: 0,
		delayMinutes: undefined,
		sleepLossMinutes: undefined,
		distanceFromFocus: 0,
		...overrides,
	};
}

function subgraph(nodes: CausalGraphNode[], edges: CausalSubgraph['edges'] = []): CausalSubgraph {
	return { focusEventId: nodes[0]?.eventId ?? 'e1', nodes, edges, truncated: false };
}

describe('causalNodeLabel', () => {
	it('由来のマーカーを先頭に置く', () => {
		// AI 判断ノードと確率イベントノードを取り違えると因果の読み方を誤る
		expect(causalNodeLabel(node({ type: 'accident' })).startsWith('△ ')).toBe(true);
		expect(causalNodeLabel(node({ type: 'decision' })).startsWith('◇ ')).toBe(true);
		expect(causalNodeLabel(node({ type: 'commute_delay' })).startsWith('□ ')).toBe(true);
	});

	it('Event 名・時刻・Agent を 3 行で並べる', () => {
		const label = causalNodeLabel(node({ type: 'accident', tick: 36, actorId: 'agent-0007' }));

		expect(label.split('\n')).toEqual(['△ Accident', 'D1 09:00', 'agent-0007']);
	});

	it('Agent が居ない Event では - を出す', () => {
		expect(causalNodeLabel(node({ actorId: undefined })).split('\n')[2]).toBe('-');
	});

	it('睡眠損失があれば時刻の後ろへ添える', () => {
		const label = causalNodeLabel(node({ type: 'sleep_loss', tick: 0, sleepLossMinutes: 45 }));

		expect(label.split('\n')[1]).toBe('D1 00:00 sleep -45min');
	});

	it('遅延があれば時刻の後ろへ添える', () => {
		const label = causalNodeLabel(node({ tick: 0, delayMinutes: 20 }));

		expect(label.split('\n')[1]).toBe('D1 00:00 +20min');
	});

	it('両方あれば睡眠損失を優先する', () => {
		// 睡眠不足の伝播を追う画面なので、遅延より睡眠への影響を見せる
		const label = causalNodeLabel(node({ tick: 0, delayMinutes: 20, sleepLossMinutes: 45 }));

		expect(label.split('\n')[1]).toBe('D1 00:00 sleep -45min');
	});
});

describe('toCausalGraphLayout', () => {
	it('部分グラフが無ければ空を返す', () => {
		expect(toCausalGraphLayout(null)).toEqual({ nodes: [], edges: [] });
	});

	it('起点からの距離を列に割り当てる。原因が左、結果が右', () => {
		const layout = toCausalGraphLayout(
			subgraph([
				node({ eventId: 'cause', distanceFromFocus: -1 }),
				node({ eventId: 'focus', distanceFromFocus: 0 }),
				node({ eventId: 'effect', distanceFromFocus: 2 }),
			]),
		);

		expect(layout.nodes.map((n) => n.x)).toEqual([-COLUMN_WIDTH, 0, 2 * COLUMN_WIDTH]);
	});

	it('同じ列のノードは現れた順に縦へ積む', () => {
		const layout = toCausalGraphLayout(
			subgraph([
				node({ eventId: 'a', distanceFromFocus: 1 }),
				node({ eventId: 'b', distanceFromFocus: 1 }),
				node({ eventId: 'c', distanceFromFocus: 1 }),
			]),
		);

		expect(layout.nodes.map((n) => n.y)).toEqual([0, ROW_HEIGHT, 2 * ROW_HEIGHT]);
	});

	it('列ごとに行のカウントは独立する', () => {
		const layout = toCausalGraphLayout(
			subgraph([
				node({ eventId: 'a', distanceFromFocus: 0 }),
				node({ eventId: 'b', distanceFromFocus: 1 }),
				node({ eventId: 'c', distanceFromFocus: 0 }),
			]),
		);

		expect(layout.nodes.map((n) => [n.x, n.y])).toEqual([
			[0, 0],
			[COLUMN_WIDTH, 0],
			[0, ROW_HEIGHT],
		]);
	});

	it('距離 0 のノードだけを起点として印を付ける', () => {
		const layout = toCausalGraphLayout(
			subgraph([
				node({ eventId: 'focus', distanceFromFocus: 0 }),
				node({ eventId: 'other', distanceFromFocus: 1 }),
			]),
		);

		expect(layout.nodes.map((n) => n.isFocus)).toEqual([true, false]);
	});

	it('由来ごとに枠線の種類を変える。色だけに頼らない', () => {
		const layout = toCausalGraphLayout(
			subgraph([
				node({ eventId: 'a', type: 'decision' }),
				node({ eventId: 'b', type: 'accident' }),
				node({ eventId: 'c', type: 'commute_delay' }),
			]),
		);

		expect(layout.nodes.map((n) => n.borderStyle)).toEqual(['dashed', 'dotted', 'solid']);
	});

	it('エッジは向きが分かる ID を持つ', () => {
		const layout = toCausalGraphLayout(
			subgraph([node()], [{ fromEventId: 'e1', toEventId: 'e2' }]),
		);

		expect(layout.edges).toEqual([{ id: 'e1->e2', source: 'e1', target: 'e2' }]);
	});
});
