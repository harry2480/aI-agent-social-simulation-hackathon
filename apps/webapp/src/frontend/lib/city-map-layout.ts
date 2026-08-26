import type {
	Agent,
	District,
	Facility,
	SleepStateName,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import type { FacilityTypeName } from './city-map-presentation';

/**
 * 施設座標を扱う仮想空間の一辺。City.generate は地区を 0〜100 に置き、
 * 施設はそこから ±5 ずれるため、余白を含めて 110 とする。
 */
export const WORLD_SIZE = 110;

/** Agent を表す円の半径（キャンバス座標） */
export const AGENT_RADIUS = 3;

/** クリック位置から Agent を選べる距離（キャンバス座標） */
export const AGENT_HIT_RADIUS = 12;

/** 仮想空間の座標をキャンバス座標へ写す */
export interface CanvasTransform {
	scale: number;
	toX: (worldX: number) => number;
	toY: (worldY: number) => number;
	/** キャンバス座標から仮想空間へ戻す。クリック位置を都市の座標で扱うために使う */
	toWorldX: (canvasX: number) => number;
	toWorldY: (canvasY: number) => number;
}

export interface AgentPosition {
	id: string;
	x: number;
	y: number;
}

/** 表示範囲。zoom = 1 で都市全体が収まり、center は画面中央に来る仮想座標 */
export interface MapViewport {
	zoom: number;
	centerX: number;
	centerY: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
/** ＋ / − ボタン 1 回あたりの倍率 */
export const ZOOM_STEP = 1.5;

export const DEFAULT_VIEWPORT: MapViewport = {
	zoom: MIN_ZOOM,
	centerX: WORLD_SIZE / 2,
	centerY: WORLD_SIZE / 2,
};

/** ズーム倍率と中心を可動範囲へ収める。都市を画面外へ完全に追い出せないようにする */
export function clampViewport(viewport: MapViewport): MapViewport {
	const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom));
	const clamp = (value: number): number => Math.min(WORLD_SIZE, Math.max(0, value));

	return { zoom, centerX: clamp(viewport.centerX), centerY: clamp(viewport.centerY) };
}

/**
 * キャンバスサイズに合わせた変換を作る。
 * 縦横比が変わっても都市が歪まないよう短辺に合わせて拡大し、余った側は中央へ寄せる。
 * viewport を渡すと、その中心と倍率で切り出す。
 */
export function createCanvasTransform(
	width: number,
	height: number,
	viewport: MapViewport = DEFAULT_VIEWPORT,
): CanvasTransform {
	const { zoom, centerX, centerY } = clampViewport(viewport);
	const scale = (Math.min(width, height) / WORLD_SIZE) * zoom;
	const offsetX = width / 2 - centerX * scale;
	const offsetY = height / 2 - centerY * scale;

	return {
		scale,
		toX: (worldX) => worldX * scale + offsetX,
		toY: (worldY) => worldY * scale + offsetY,
		toWorldX: (canvasX) => (canvasX - offsetX) / scale,
		toWorldY: (canvasY) => (canvasY - offsetY) / scale,
	};
}

/** 黄金角。同一施設に集まる Agent を重ならないよう円状へ散らす */
const GOLDEN_ANGLE = 2.399963229728653;
/** 施設内で Agent を散らす間隔 */
const SPIRAL_SPACING = 2.2;

/**
 * Agent の描画位置を決める。
 *
 * 同一施設へ重なる Agent を見分けられるよう、施設内で小さく円状に配置する。
 * 位置は「その施設で何番目に現れた Agent か」だけで決まるため、
 * 同じ Agent 列を渡せば描画ごとに揺れない。
 *
 * 施設が見つからない Agent（移動中など）は描画対象から外れる。
 */
export function agentPositions(
	agents: readonly Pick<Agent, 'id' | 'currentLocationId'>[],
	facilities: readonly Pick<Facility, 'id' | 'x' | 'y'>[],
	transform: CanvasTransform,
): AgentPosition[] {
	const facilityById = new Map(facilities.map((facility) => [facility.id, facility]));
	const countByFacility = new Map<string, number>();
	const positions: AgentPosition[] = [];

	for (const agent of agents) {
		const facility = facilityById.get(agent.currentLocationId);
		if (facility === undefined) {
			continue;
		}
		const indexInFacility = countByFacility.get(facility.id) ?? 0;
		countByFacility.set(facility.id, indexInFacility + 1);

		const angle = indexInFacility * GOLDEN_ANGLE;
		const radius = Math.sqrt(indexInFacility) * SPIRAL_SPACING;
		positions.push({
			id: agent.id,
			x: transform.toX(facility.x) + Math.cos(angle) * radius,
			y: transform.toY(facility.y) + Math.sin(angle) * radius,
		});
	}

	return positions;
}

/**
 * クリック位置に最も近い Agent を返す。
 * どの Agent からも離れている場合は null を返し、選択を変えない。
 */
export function nearestAgentWithin(
	positions: readonly AgentPosition[],
	point: { x: number; y: number },
	maxDistance: number = AGENT_HIT_RADIUS,
): string | null {
	let nearestId: string | null = null;
	let nearestDistance = Number.POSITIVE_INFINITY;

	for (const position of positions) {
		const distance = Math.hypot(position.x - point.x, position.y - point.y);
		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearestId = position.id;
		}
	}

	return nearestId !== null && nearestDistance <= maxDistance ? nearestId : null;
}

/**
 * 矢印キーで選択を 1 つ動かす。クリック選択のキーボード等価操作。
 *
 * 末尾から次へ進むと先頭へ回り込む。未選択の状態から進めた場合は先頭、
 * 戻した場合は末尾を選ぶ。
 */
export function nextAgentId(
	agents: readonly Pick<Agent, 'id'>[],
	selectedId: string | null,
	delta: 1 | -1,
): string | null {
	if (agents.length === 0) {
		return null;
	}

	const currentIndex = agents.findIndex((agent) => agent.id === selectedId);
	if (currentIndex === -1) {
		return (delta === 1 ? agents[0] : agents[agents.length - 1])?.id ?? null;
	}

	const nextIndex = (currentIndex + delta + agents.length) % agents.length;
	return agents[nextIndex]?.id ?? null;
}

/** 施設マーカーの半径（キャンバス座標） */
export const FACILITY_MARKER_RADIUS = 2.5;

export interface FacilityMarker {
	id: string;
	type: FacilityTypeName;
	x: number;
	y: number;
}

/** 施設の描画位置。Agent と違い Tick ごとに動かないため、都市が変わらない限り同じ結果になる */
export function facilityMarkers(
	facilities: readonly Pick<Facility, 'id' | 'type' | 'x' | 'y'>[],
	transform: CanvasTransform,
): FacilityMarker[] {
	return facilities.map((facility) => ({
		id: facility.id,
		type: facility.type,
		x: transform.toX(facility.x),
		y: transform.toY(facility.y),
	}));
}

/**
 * 事故を起こした Agent の描画位置。
 * 事故は道路上で起きるが Event に発生地点を持たせていないため、
 * 「誰が事故を起こしたか」を Agent の位置で示す。道路側の影響は渋滞表示が担う。
 */
export function accidentMarkers(
	agentIds: readonly string[],
	positions: readonly AgentPosition[],
): AgentPosition[] {
	const positionById = new Map(positions.map((position) => [position.id, position]));
	const markers: AgentPosition[] = [];
	for (const agentId of agentIds) {
		const position = positionById.get(agentId);
		if (position !== undefined) {
			markers.push(position);
		}
	}
	return markers;
}

export interface TransmissionArrow {
	fromX: number;
	fromY: number;
	toX: number;
	toY: number;
}

/**
 * Sleep Transmission を伝播元 → 伝播先の矢印にする。
 *
 * どちらかが移動中で地図上に居ない場合と、同一施設に居て矢印が点になる場合は描かない。
 * 同じ組み合わせが複数回伝播しても矢印は 1 本にまとめる。
 */
export function transmissionArrows(
	transmissions: readonly { fromAgentId: string; toAgentId: string }[],
	positions: readonly AgentPosition[],
): TransmissionArrow[] {
	const positionById = new Map(positions.map((position) => [position.id, position]));
	const seen = new Set<string>();
	const arrows: TransmissionArrow[] = [];

	for (const transmission of transmissions) {
		const key = `${transmission.fromAgentId}->${transmission.toAgentId}`;
		if (seen.has(key)) {
			continue;
		}
		const from = positionById.get(transmission.fromAgentId);
		const to = positionById.get(transmission.toAgentId);
		if (from === undefined || to === undefined) {
			continue;
		}
		if (from.x === to.x && from.y === to.y) {
			continue;
		}
		seen.add(key);
		arrows.push({ fromX: from.x, fromY: from.y, toX: to.x, toY: to.y });
	}

	return arrows;
}

/** 集約表示へ切り替えるズーム倍率の上限。これ以上寄せれば常に 1 人ずつ描く */
export const AGGREGATION_MAX_ZOOM = 1.5;
/**
 * 1 地区あたりの人数がこれを超えると、低ズームでは円が重なって状態を数えられない。
 *
 * 標準都市は 7 地区あり、標準 Population 300 人なら 1 地区 43 人で個別描画のまま、
 * 最大 Population 500 人（1 地区 71 人）で集約へ切り替わる（要件定義 35 章）。
 * 標準条件のデモで Agent を直接クリックできる操作性を保つための線引き。
 */
export const AGGREGATION_AGENTS_PER_DISTRICT = 60;

/** 低ズームで Agent を地区単位へ集約すべきか */
export function shouldAggregateAgents(
	agentCount: number,
	districtCount: number,
	zoom: number,
): boolean {
	if (districtCount === 0 || zoom > AGGREGATION_MAX_ZOOM) {
		return false;
	}
	return agentCount / districtCount > AGGREGATION_AGENTS_PER_DISTRICT;
}

export interface DistrictCluster {
	districtId: string;
	/** キャンバス座標 */
	x: number;
	y: number;
	/** 仮想空間の座標。クリックで寄せる中心に使う */
	worldX: number;
	worldY: number;
	total: number;
	/** 睡眠状態ごとの人数。集約しても状態の内訳が消えないようにする */
	countsByState: Record<SleepStateName, number>;
}

/** 集約円の最小半径（キャンバス座標） */
export const CLUSTER_MIN_RADIUS = 8;
/** 人数 1 人あたりの半径の伸び。面積が人数に比例するよう平方根で効かせる */
export const CLUSTER_RADIUS_PER_AGENT = 1.6;

export function clusterRadius(total: number): number {
	return CLUSTER_MIN_RADIUS + Math.sqrt(total) * CLUSTER_RADIUS_PER_AGENT;
}

/**
 * Agent を所属地区ごとにまとめる。
 * 施設が見つからない Agent（移動中など）は個別描画と同じく数えない。
 * 誰も居ない地区は返さない。
 */
export function districtClusters(
	agents: readonly Pick<Agent, 'id' | 'currentLocationId'>[],
	facilities: readonly Pick<Facility, 'id' | 'districtId'>[],
	districts: readonly Pick<District, 'id' | 'x' | 'y'>[],
	stateOf: (agentId: string) => SleepStateName,
	transform: CanvasTransform,
): DistrictCluster[] {
	const districtIdByFacility = new Map(
		facilities.map((facility) => [facility.id, facility.districtId]),
	);
	const countsByDistrict = new Map<string, Record<SleepStateName, number>>();

	for (const agent of agents) {
		const districtId = districtIdByFacility.get(agent.currentLocationId);
		if (districtId === undefined) {
			continue;
		}
		const counts =
			countsByDistrict.get(districtId) ??
			({ normal: 0, tired: 0, sleep_deprived: 0, severe_sleep_deprived: 0 } as Record<
				SleepStateName,
				number
			>);
		counts[stateOf(agent.id)] += 1;
		countsByDistrict.set(districtId, counts);
	}

	const clusters: DistrictCluster[] = [];
	for (const district of districts) {
		const counts = countsByDistrict.get(district.id);
		if (counts === undefined) {
			continue;
		}
		const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
		clusters.push({
			districtId: district.id,
			x: transform.toX(district.x),
			y: transform.toY(district.y),
			worldX: district.x,
			worldY: district.y,
			total,
			countsByState: counts,
		});
	}

	return clusters;
}

/** クリック位置に重なっている集約円。どれにも当たらなければ null */
export function clusterAt(
	clusters: readonly DistrictCluster[],
	point: { x: number; y: number },
): DistrictCluster | null {
	let hit: DistrictCluster | null = null;
	let hitDistance = Number.POSITIVE_INFINITY;

	for (const cluster of clusters) {
		const distance = Math.hypot(cluster.x - point.x, cluster.y - point.y);
		if (distance <= clusterRadius(cluster.total) && distance < hitDistance) {
			hit = cluster;
			hitDistance = distance;
		}
	}

	return hit;
}
