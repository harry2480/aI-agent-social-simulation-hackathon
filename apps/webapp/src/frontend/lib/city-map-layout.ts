import type {
	Agent,
	Facility,
} from '@/backend/presentation/composition/watch-mode-engine.composition';

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
}

export interface AgentPosition {
	id: string;
	x: number;
	y: number;
}

/**
 * キャンバスサイズに合わせた変換を作る。
 * 縦横比が変わっても都市が歪まないよう短辺に合わせて拡大し、余った側は中央へ寄せる。
 */
export function createCanvasTransform(width: number, height: number): CanvasTransform {
	const scale = Math.min(width, height) / WORLD_SIZE;
	const offsetX = (width - WORLD_SIZE * scale) / 2;
	const offsetY = (height - WORLD_SIZE * scale) / 2;

	return {
		scale,
		toX: (worldX) => worldX * scale + offsetX,
		toY: (worldY) => worldY * scale + offsetY,
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
