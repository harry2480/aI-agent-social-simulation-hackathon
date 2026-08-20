import {
	AGENT_HIT_RADIUS,
	WORLD_SIZE,
	agentPositions,
	createCanvasTransform,
	nearestAgentWithin,
	nextAgentId,
} from '@/frontend/lib/city-map-layout';
import { describe, expect, it } from 'vitest';

const FACILITIES = [
	{ id: 'home-0', x: 10, y: 20 },
	{ id: 'home-1', x: 80, y: 40 },
];

function agent(id: string, currentLocationId: string) {
	return { id, currentLocationId };
}

describe('createCanvasTransform', () => {
	it('正方形のキャンバスでは仮想空間をそのまま埋める', () => {
		const transform = createCanvasTransform(WORLD_SIZE, WORLD_SIZE);

		expect(transform.scale).toBe(1);
		expect(transform.toX(0)).toBe(0);
		expect(transform.toY(WORLD_SIZE)).toBe(WORLD_SIZE);
	});

	it('短辺に合わせて拡大する。都市の縦横比が歪まない', () => {
		const transform = createCanvasTransform(400, 200);

		expect(transform.scale).toBe(200 / WORLD_SIZE);
	});

	it('余った側は中央へ寄せる', () => {
		const transform = createCanvasTransform(400, 200);
		const drawnWidth = WORLD_SIZE * transform.scale;

		// 左右の余白が等しい
		expect(transform.toX(0)).toBeCloseTo((400 - drawnWidth) / 2, 10);
		expect(400 - transform.toX(WORLD_SIZE)).toBeCloseTo(transform.toX(0), 10);
		// 短辺側には余白が出ない
		expect(transform.toY(0)).toBeCloseTo(0, 10);
	});
});

describe('agentPositions', () => {
	const transform = createCanvasTransform(WORLD_SIZE, WORLD_SIZE);

	it('施設に 1 人だけなら施設座標そのものに置く', () => {
		const positions = agentPositions([agent('a', 'home-0')], FACILITIES, transform);

		expect(positions).toEqual([{ id: 'a', x: 10, y: 20 }]);
	});

	it('同一施設に重なる Agent を散らして見分けられるようにする', () => {
		const positions = agentPositions(
			[agent('a', 'home-0'), agent('b', 'home-0'), agent('c', 'home-0')],
			FACILITIES,
			transform,
		);

		const distinct = new Set(positions.map((position) => `${position.x},${position.y}`));
		expect(distinct.size).toBe(3);
	});

	it('位置は Agent の並び順だけで決まり、描画ごとに揺れない', () => {
		const agents = [agent('a', 'home-0'), agent('b', 'home-0')];

		expect(agentPositions(agents, FACILITIES, transform)).toEqual(
			agentPositions(agents, FACILITIES, transform),
		);
	});

	it('施設が違えば重なり順のカウントは独立する', () => {
		const positions = agentPositions(
			[agent('a', 'home-0'), agent('b', 'home-1')],
			FACILITIES,
			transform,
		);

		// どちらも各施設で 1 人目なので、施設座標そのものに置かれる
		expect(positions).toEqual([
			{ id: 'a', x: 10, y: 20 },
			{ id: 'b', x: 80, y: 40 },
		]);
	});

	it('施設に居ない Agent は描画対象から外す', () => {
		// 移動中の Agent は currentLocationId が施設 ID にならない
		const positions = agentPositions(
			[agent('a', 'home-0'), agent('traveling', 'road-1')],
			FACILITIES,
			transform,
		);

		expect(positions.map((position) => position.id)).toEqual(['a']);
	});

	it('キャンバス座標へ変換した位置を返す', () => {
		const scaled = createCanvasTransform(WORLD_SIZE * 2, WORLD_SIZE * 2);

		expect(agentPositions([agent('a', 'home-0')], FACILITIES, scaled)).toEqual([
			{ id: 'a', x: 20, y: 40 },
		]);
	});
});

describe('nearestAgentWithin', () => {
	const positions = [
		{ id: 'a', x: 0, y: 0 },
		{ id: 'b', x: 100, y: 100 },
	];

	it('最も近い Agent を返す', () => {
		expect(nearestAgentWithin(positions, { x: 3, y: 4 })).toBe('a');
		expect(nearestAgentWithin(positions, { x: 98, y: 99 })).toBe('b');
	});

	it('どの Agent からも離れていれば null を返す', () => {
		// 選択を変えないことで、地図の余白クリックで選択が飛ばない
		expect(nearestAgentWithin(positions, { x: 50, y: 50 })).toBeNull();
	});

	it('判定距離ちょうどは選択に含める', () => {
		expect(nearestAgentWithin(positions, { x: AGENT_HIT_RADIUS, y: 0 })).toBe('a');
		expect(nearestAgentWithin(positions, { x: AGENT_HIT_RADIUS + 0.1, y: 0 })).toBeNull();
	});

	it('描画対象が無ければ null を返す', () => {
		expect(nearestAgentWithin([], { x: 0, y: 0 })).toBeNull();
	});
});

describe('nextAgentId', () => {
	const agents = [agent('a', 'home-0'), agent('b', 'home-0'), agent('c', 'home-0')];

	it('右キーで次の Agent へ進む', () => {
		expect(nextAgentId(agents, 'a', 1)).toBe('b');
	});

	it('左キーで前の Agent へ戻る', () => {
		expect(nextAgentId(agents, 'b', -1)).toBe('a');
	});

	it('末尾から進むと先頭へ回り込む', () => {
		expect(nextAgentId(agents, 'c', 1)).toBe('a');
	});

	it('先頭から戻ると末尾へ回り込む', () => {
		expect(nextAgentId(agents, 'a', -1)).toBe('c');
	});

	it('未選択から進むと先頭、戻すと末尾を選ぶ', () => {
		expect(nextAgentId(agents, null, 1)).toBe('a');
		expect(nextAgentId(agents, null, -1)).toBe('c');
	});

	it('選択中の Agent が一覧から消えていても先頭・末尾へ落ちる', () => {
		// Population を変えて再初期化した直後など
		expect(nextAgentId(agents, 'removed', 1)).toBe('a');
		expect(nextAgentId(agents, 'removed', -1)).toBe('c');
	});

	it('Agent が居なければ null を返す', () => {
		expect(nextAgentId([], null, 1)).toBeNull();
	});
});
