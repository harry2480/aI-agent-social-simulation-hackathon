import {
	AGENT_HIT_RADIUS,
	AGGREGATION_MAX_ZOOM,
	DEFAULT_VIEWPORT,
	MAX_ZOOM,
	MIN_ZOOM,
	WORLD_SIZE,
	accidentMarkers,
	agentPositions,
	clampViewport,
	clusterAt,
	clusterRadius,
	createCanvasTransform,
	districtClusters,
	facilityMarkers,
	nearestAgentWithin,
	nextAgentId,
	shouldAggregateAgents,
	transmissionArrows,
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

describe('facilityMarkers', () => {
	it('施設をキャンバス座標へ写す', () => {
		const transform = createCanvasTransform(WORLD_SIZE, WORLD_SIZE);
		const markers = facilityMarkers([{ id: 'store-0', type: 'store', x: 10, y: 20 }], transform);

		expect(markers).toEqual([{ id: 'store-0', type: 'store', x: 10, y: 20 }]);
	});
});

describe('accidentMarkers', () => {
	const positions = [
		{ id: 'agent-0', x: 10, y: 10 },
		{ id: 'agent-1', x: 20, y: 20 },
	];

	it('事故を起こした Agent の描画位置を返す', () => {
		expect(accidentMarkers(['agent-1'], positions)).toEqual([{ id: 'agent-1', x: 20, y: 20 }]);
	});

	it('地図上に居ない Agent は描かない', () => {
		// 移動中の Agent は施設に紐づかず描画対象から外れている
		expect(accidentMarkers(['agent-9'], positions)).toEqual([]);
	});
});

describe('transmissionArrows', () => {
	const positions = [
		{ id: 'agent-0', x: 10, y: 10 },
		{ id: 'agent-1', x: 50, y: 30 },
		{ id: 'agent-2', x: 10, y: 10 },
	];

	it('伝播元から伝播先への矢印にする', () => {
		const arrows = transmissionArrows(
			[{ fromAgentId: 'agent-0', toAgentId: 'agent-1' }],
			positions,
		);

		expect(arrows).toEqual([{ fromX: 10, fromY: 10, toX: 50, toY: 30 }]);
	});

	it('同じ組み合わせが複数回伝播しても 1 本にまとめる', () => {
		const arrows = transmissionArrows(
			[
				{ fromAgentId: 'agent-0', toAgentId: 'agent-1' },
				{ fromAgentId: 'agent-0', toAgentId: 'agent-1' },
			],
			positions,
		);

		expect(arrows).toHaveLength(1);
	});

	it('どちらかが地図上に居なければ描かない', () => {
		expect(
			transmissionArrows([{ fromAgentId: 'agent-0', toAgentId: 'agent-9' }], positions),
		).toEqual([]);
	});

	it('同じ位置に重なっている場合は描かない。点になって向きが読めないため', () => {
		expect(
			transmissionArrows([{ fromAgentId: 'agent-0', toAgentId: 'agent-2' }], positions),
		).toEqual([]);
	});
});

describe('createCanvasTransform（ズーム・パン）', () => {
	it('倍率を上げると同じ距離が広く描かれる', () => {
		const base = createCanvasTransform(WORLD_SIZE, WORLD_SIZE);
		const zoomed = createCanvasTransform(WORLD_SIZE, WORLD_SIZE, {
			...DEFAULT_VIEWPORT,
			zoom: 2,
		});

		expect(zoomed.scale).toBe(base.scale * 2);
	});

	it('中心に指定した仮想座標が画面中央へ来る', () => {
		const transform = createCanvasTransform(200, 200, { zoom: 2, centerX: 10, centerY: 90 });

		expect(transform.toX(10)).toBeCloseTo(100, 10);
		expect(transform.toY(90)).toBeCloseTo(100, 10);
	});

	it('キャンバス座標から仮想座標へ戻せる', () => {
		// クリック位置を都市の座標で扱うために使う
		const transform = createCanvasTransform(300, 200, { zoom: 3, centerX: 40, centerY: 60 });

		expect(transform.toWorldX(transform.toX(25))).toBeCloseTo(25, 10);
		expect(transform.toWorldY(transform.toY(70))).toBeCloseTo(70, 10);
	});
});

describe('clampViewport', () => {
	it('倍率を可動範囲へ収める', () => {
		expect(clampViewport({ ...DEFAULT_VIEWPORT, zoom: 0.1 }).zoom).toBe(MIN_ZOOM);
		expect(clampViewport({ ...DEFAULT_VIEWPORT, zoom: 999 }).zoom).toBe(MAX_ZOOM);
	});

	it('中心を都市の外へ出さない。都市を画面外へ追い出せてしまうため', () => {
		expect(clampViewport({ zoom: 2, centerX: -50, centerY: 500 })).toEqual({
			zoom: 2,
			centerX: 0,
			centerY: WORLD_SIZE,
		});
	});
});

describe('shouldAggregateAgents', () => {
	it('1 地区あたりの人数が多く、寄せていなければ集約する', () => {
		// 最大 Population 500 人・7 地区（1 地区 71 人）を想定
		expect(shouldAggregateAgents(500, 7, MIN_ZOOM)).toBe(true);
	});

	it('標準 Population では集約しない。デモで Agent を直接クリックできるようにするため', () => {
		expect(shouldAggregateAgents(300, 7, MIN_ZOOM)).toBe(false);
	});

	it('寄せれば人数によらず個別描画へ戻す', () => {
		expect(shouldAggregateAgents(500, 7, AGGREGATION_MAX_ZOOM + 0.1)).toBe(false);
	});

	it('地区が無ければ集約しない', () => {
		expect(shouldAggregateAgents(500, 0, MIN_ZOOM)).toBe(false);
	});
});

describe('districtClusters', () => {
	const transform = createCanvasTransform(WORLD_SIZE, WORLD_SIZE);
	const facilities = [
		{ id: 'home-0', districtId: 'residential-0' },
		{ id: 'workplace-0', districtId: 'office-0' },
	];
	const districts = [
		{ id: 'residential-0', x: 10, y: 20 },
		{ id: 'office-0', x: 60, y: 70 },
	];
	const states: Record<string, 'normal' | 'tired' | 'sleep_deprived' | 'severe_sleep_deprived'> = {
		'agent-0': 'normal',
		'agent-1': 'sleep_deprived',
		'agent-2': 'sleep_deprived',
	};
	const stateOf = (agentId: string) => states[agentId] ?? 'normal';

	it('地区ごとに人数と睡眠状態の内訳をまとめる', () => {
		const clusters = districtClusters(
			[
				{ id: 'agent-0', currentLocationId: 'home-0' },
				{ id: 'agent-1', currentLocationId: 'home-0' },
				{ id: 'agent-2', currentLocationId: 'workplace-0' },
			],
			facilities,
			districts,
			stateOf,
			transform,
		);

		expect(clusters).toHaveLength(2);
		expect(clusters[0]?.total).toBe(2);
		expect(clusters[0]?.countsByState.sleep_deprived).toBe(1);
		expect(clusters[1]?.total).toBe(1);
	});

	it('誰も居ない地区は返さない', () => {
		const clusters = districtClusters(
			[{ id: 'agent-0', currentLocationId: 'home-0' }],
			facilities,
			districts,
			stateOf,
			transform,
		);

		expect(clusters.map((cluster) => cluster.districtId)).toEqual(['residential-0']);
	});

	it('移動中の Agent は数えない。個別描画と同じ扱いにする', () => {
		const clusters = districtClusters(
			[{ id: 'agent-0', currentLocationId: 'on-the-road' }],
			facilities,
			districts,
			stateOf,
			transform,
		);

		expect(clusters).toEqual([]);
	});

	it('クリックで寄せられるよう仮想座標も返す', () => {
		const clusters = districtClusters(
			[{ id: 'agent-0', currentLocationId: 'home-0' }],
			facilities,
			districts,
			stateOf,
			transform,
		);

		expect(clusters[0]?.worldX).toBe(10);
		expect(clusters[0]?.worldY).toBe(20);
	});
});

describe('clusterAt', () => {
	const cluster = {
		districtId: 'residential-0',
		x: 100,
		y: 100,
		worldX: 10,
		worldY: 20,
		total: 50,
		countsByState: { normal: 50, tired: 0, sleep_deprived: 0, severe_sleep_deprived: 0 },
	};

	it('円の内側なら当たる', () => {
		expect(clusterAt([cluster], { x: 100, y: 100 })?.districtId).toBe('residential-0');
	});

	it('円の外なら当たらない', () => {
		expect(clusterAt([cluster], { x: 100, y: 100 + clusterRadius(50) + 1 })).toBeNull();
	});
});
