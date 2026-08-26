'use client';

import type {
	Agent,
	City,
	SleepStateName,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import { Button } from '@/frontend/components/ui/button';
import {
	AGENT_RADIUS,
	type AgentPosition,
	DEFAULT_VIEWPORT,
	type DistrictCluster,
	FACILITY_MARKER_RADIUS,
	MAX_ZOOM,
	MIN_ZOOM,
	type MapViewport,
	TRANSMISSION_ARROW_HEAD_LENGTH,
	type TransmissionArrow,
	ZOOM_STEP,
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
import {
	ACCIDENT_PRESENTATION,
	FACILITY_TYPE_ORDER,
	type FacilityShape,
	TRANSMISSION_PRESENTATION,
	facilityPresentation,
} from '@/frontend/lib/city-map-presentation';
import {
	SLEEP_STATE_ORDER,
	sleepStateColorVars,
	sleepStatePresentation,
} from '@/frontend/lib/sleep-state-presentation';
import type { MapTransmission } from '@/frontend/lib/watch-mode-view';
import { useCallback, useEffect, useRef, useState } from 'react';

interface CityMapProps {
	city: City;
	agents: Agent[];
	sleepStateOf: (agent: Agent) => SleepStateName;
	congestedRoadIds: readonly string[];
	accidentAgentIds: readonly string[];
	transmissions: readonly MapTransmission[];
	selectedAgentId: string | null;
	onSelectAgent: (agentId: string) => void;
}

/** 事故マーカーの半径。Agent の円より一回り大きくして重ねる */
const ACCIDENT_MARKER_RADIUS = AGENT_RADIUS + 3;
/** 集約円をクリックしたときに寄せる倍率。集約が解ける倍率まで一気に入る */
const CLUSTER_FOCUS_ZOOM = 2;
/** ホイール 1 ノッチあたりの倍率 */
const WHEEL_ZOOM_STEP = 1.1;
/** ドラッグ扱いにする移動量（px）。これ未満はクリックとして選択に使う */
const DRAG_THRESHOLD_PX = 4;

/** 施設マーカーを形状で描き分ける。色だけに頼らず種別を区別するため */
function drawFacilityShape(
	context: CanvasRenderingContext2D,
	shape: FacilityShape,
	x: number,
	y: number,
	radius: number,
): void {
	context.beginPath();
	switch (shape) {
		case 'square':
			context.rect(x - radius, y - radius, radius * 2, radius * 2);
			break;
		case 'triangle':
			context.moveTo(x, y - radius);
			context.lineTo(x + radius, y + radius);
			context.lineTo(x - radius, y + radius);
			context.closePath();
			break;
		case 'diamond':
			context.moveTo(x, y - radius);
			context.lineTo(x + radius, y);
			context.lineTo(x, y + radius);
			context.lineTo(x - radius, y);
			context.closePath();
			break;
		case 'cross':
			context.rect(x - radius / 3, y - radius, (radius * 2) / 3, radius * 2);
			context.rect(x - radius, y - radius / 3, radius * 2, (radius * 2) / 3);
			break;
	}
	context.fill();
}

/** 伝播元 → 伝播先の矢印。向きが分かるよう矢先を付ける */
function drawTransmissionArrow(context: CanvasRenderingContext2D, arrow: TransmissionArrow): void {
	context.beginPath();
	context.moveTo(arrow.fromX, arrow.fromY);
	context.lineTo(arrow.toX, arrow.toY);
	context.stroke();

	const angle = Math.atan2(arrow.toY - arrow.fromY, arrow.toX - arrow.fromX);
	context.beginPath();
	context.moveTo(arrow.toX, arrow.toY);
	context.lineTo(
		arrow.toX - Math.cos(angle - Math.PI / 6) * TRANSMISSION_ARROW_HEAD_LENGTH,
		arrow.toY - Math.sin(angle - Math.PI / 6) * TRANSMISSION_ARROW_HEAD_LENGTH,
	);
	context.moveTo(arrow.toX, arrow.toY);
	context.lineTo(
		arrow.toX - Math.cos(angle + Math.PI / 6) * TRANSMISSION_ARROW_HEAD_LENGTH,
		arrow.toY - Math.sin(angle + Math.PI / 6) * TRANSMISSION_ARROW_HEAD_LENGTH,
	);
	context.stroke();
}

/**
 * 地区へ集約した Agent。人数を面積で、睡眠状態の内訳をドーナツの弧で示す。
 * 色だけで読ませないよう中心に人数を書く。
 */
function drawCluster(
	context: CanvasRenderingContext2D,
	cluster: DistrictCluster,
	stateColors: Record<SleepStateName, string>,
	colors: { disc: string; text: string },
): void {
	const radius = clusterRadius(cluster.total);
	let startAngle = -Math.PI / 2;

	for (const state of SLEEP_STATE_ORDER) {
		const count = cluster.countsByState[state];
		if (count === 0) {
			continue;
		}
		const endAngle = startAngle + (count / cluster.total) * Math.PI * 2;
		context.beginPath();
		context.moveTo(cluster.x, cluster.y);
		context.arc(cluster.x, cluster.y, radius, startAngle, endAngle);
		context.closePath();
		context.fillStyle = stateColors[state];
		context.fill();
		startAngle = endAngle;
	}

	context.beginPath();
	context.arc(cluster.x, cluster.y, radius * 0.55, 0, Math.PI * 2);
	context.fillStyle = colors.disc;
	context.fill();

	context.fillStyle = colors.text;
	context.font = '11px sans-serif';
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.fillText(String(cluster.total), cluster.x, cluster.y);
	context.textBaseline = 'alphabetic';
}

/** 事故を起こした Agent に重ねる ✕ 印 */
function drawAccidentMarker(context: CanvasRenderingContext2D, position: AgentPosition): void {
	const offset = ACCIDENT_MARKER_RADIUS;
	context.beginPath();
	context.moveTo(position.x - offset, position.y - offset);
	context.lineTo(position.x + offset, position.y + offset);
	context.moveTo(position.x + offset, position.y - offset);
	context.lineTo(position.x - offset, position.y + offset);
	context.stroke();
}

/**
 * City Map。300〜500 Agent を毎 Tick 描画するため、DOM 要素ではなく Canvas を使う。
 * 色は CSS 変数から解決し、描画コード内に色リテラルを持たない。
 * 座標計算と選択判定は city-map-layout に置き、ここは描画とイベント処理に絞る。
 */
export function CityMap({
	city,
	agents,
	sleepStateOf,
	congestedRoadIds,
	accidentAgentIds,
	transmissions,
	selectedAgentId,
	onSelectAgent,
}: CityMapProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const agentPositionsRef = useRef<AgentPosition[]>([]);
	const clustersRef = useRef<DistrictCluster[]>([]);
	const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
	/** 直前の操作がドラッグだったか。ドラッグ終わりの click を選択に使わないための目印 */
	const draggedRef = useRef(false);
	const [viewport, setViewport] = useState<MapViewport>(DEFAULT_VIEWPORT);

	/** 画面中央を保ったまま倍率だけを変える。ボタン操作用 */
	const zoomBy = useCallback((factor: number) => {
		setViewport((current) => clampViewport({ ...current, zoom: current.zoom * factor }));
	}, []);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		if (canvas === null) {
			return;
		}
		const context = canvas.getContext('2d');
		if (context === null) {
			return;
		}

		const dpr = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();
		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;
		context.setTransform(dpr, 0, 0, dpr, 0, 0);
		context.clearRect(0, 0, rect.width, rect.height);

		const transform = createCanvasTransform(rect.width, rect.height, viewport);
		const { scale, toX, toY } = transform;

		const styles = getComputedStyle(canvas);
		const borderColor = styles.getPropertyValue('--color-border').trim() || '#d4d4d8';
		const mutedColor = styles.getPropertyValue('--color-muted-foreground').trim() || '#71717a';
		const alertColor = styles.getPropertyValue('--color-alert').trim() || '#dc2626';
		const transmissionColor =
			styles.getPropertyValue(TRANSMISSION_PRESENTATION.colorVar).trim() || alertColor;
		const foreground = styles.getPropertyValue('--color-foreground').trim() || '#18181b';
		const cardColor = styles.getPropertyValue('--color-card').trim() || '#ffffff';
		// CSS 変数から実際の色を解決する。描画コード内に色リテラルを持たない
		const colorVars = sleepStateColorVars();
		const stateColors = {} as Record<SleepStateName, string>;
		for (const state of SLEEP_STATE_ORDER) {
			const value = styles.getPropertyValue(colorVars[state]).trim();
			stateColors[state] = value.length > 0 ? value : mutedColor;
		}

		const districtById = new Map(city.districts.map((district) => [district.id, district]));
		const congested = new Set(congestedRoadIds);

		// 道路
		for (const road of city.roads) {
			const from = districtById.get(road.fromDistrictId);
			const to = districtById.get(road.toDistrictId);
			if (from === undefined || to === undefined) {
				continue;
			}
			const isCongested = congested.has(road.id);
			context.beginPath();
			context.moveTo(toX(from.x), toY(from.y));
			context.lineTo(toX(to.x), toY(to.y));
			context.strokeStyle = isCongested ? alertColor : borderColor;
			context.lineWidth = isCongested ? 3 : 1;
			context.stroke();
		}

		// 地区・施設
		for (const district of city.districts) {
			context.beginPath();
			context.arc(toX(district.x), toY(district.y), 7 * scale * 0.2 + 6, 0, Math.PI * 2);
			context.fillStyle = mutedColor;
			context.globalAlpha = 0.15;
			context.fill();
			context.globalAlpha = 1;

			context.fillStyle = mutedColor;
			context.font = '10px sans-serif';
			context.textAlign = 'center';
			context.fillText(district.type, toX(district.x), toY(district.y) - 12);
		}

		// 施設。Agent より先に描いて背景側へ置く
		context.fillStyle = mutedColor;
		for (const marker of facilityMarkers(city.facilities, transform)) {
			const presentation = facilityPresentation(marker.type);
			context.globalAlpha = presentation.opacity;
			drawFacilityShape(context, presentation.shape, marker.x, marker.y, FACILITY_MARKER_RADIUS);
		}
		context.globalAlpha = 1;

		const stateById = new Map(agents.map((agent) => [agent.id, sleepStateOf(agent)]));

		// Agent 数が多く、かつ寄せていない間は地区単位へ集約する（要件定義 35 章）。
		// 集約中は個々の位置を持たないため、事故と伝播の印は寄せたときに出す。
		if (shouldAggregateAgents(agents.length, city.districts.length, viewport.zoom)) {
			const clusters = districtClusters(
				agents,
				city.facilities,
				city.districts,
				(agentId) => stateById.get(agentId) ?? 'normal',
				transform,
			);
			for (const cluster of clusters) {
				drawCluster(context, cluster, stateColors, { disc: cardColor, text: foreground });
			}
			agentPositionsRef.current = [];
			clustersRef.current = clusters;
			return;
		}
		clustersRef.current = [];

		// Agent。選択判定に使うため描画位置を保持する
		const positions = agentPositions(agents, city.facilities, transform);

		// Sleep Transmission。Agent の下に敷いて誰から誰へ渡ったかを示す。
		// 夜間はまとめて発生し本数が多くなるため、道路と Agent を潰さないよう薄く引く
		context.strokeStyle = transmissionColor;
		context.lineWidth = 1.5;
		context.globalAlpha = 0.7;
		for (const arrow of transmissionArrows(transmissions, positions)) {
			drawTransmissionArrow(context, arrow);
		}
		context.globalAlpha = 1;
		for (const position of positions) {
			context.beginPath();
			context.arc(position.x, position.y, AGENT_RADIUS, 0, Math.PI * 2);
			context.fillStyle = stateColors[stateById.get(position.id) ?? 'normal'];
			context.fill();

			if (position.id === selectedAgentId) {
				context.beginPath();
				context.arc(position.x, position.y, AGENT_RADIUS + 4, 0, Math.PI * 2);
				context.strokeStyle = foreground;
				context.lineWidth = 2;
				context.stroke();
			}
		}
		// 事故。Agent の上に重ねて発生地点を示す
		context.strokeStyle = alertColor;
		context.lineWidth = 2;
		for (const marker of accidentMarkers(accidentAgentIds, positions)) {
			drawAccidentMarker(context, marker);
		}

		agentPositionsRef.current = positions;
	}, [
		viewport,
		city,
		agents,
		sleepStateOf,
		congestedRoadIds,
		accidentAgentIds,
		transmissions,
		selectedAgentId,
	]);

	useEffect(() => {
		draw();
	}, [draw]);

	// キャンバスの表示サイズが変わったら描き直す。
	// Canvas は再レイアウトで自動的に描き直されず、前の解像度の絵が引き伸ばされたままになる。
	// 監視の張り直しを避けるため、最新の描画関数は ref 経由で呼ぶ
	const drawRef = useRef(draw);
	useEffect(() => {
		drawRef.current = draw;
	}, [draw]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (canvas === null) {
			return;
		}
		const observer = new ResizeObserver(() => drawRef.current());
		observer.observe(canvas);
		return () => observer.disconnect();
	}, []);

	// ホイールでのズーム。ページスクロールを止める必要があるため passive: false で自前に張る。
	// 更新は関数形式にしてあり、再登録が要らないので依存は空でよい
	useEffect(() => {
		const canvas = canvasRef.current;
		if (canvas === null) {
			return;
		}

		const handleWheel = (event: WheelEvent): void => {
			event.preventDefault();
			const rect = canvas.getBoundingClientRect();
			const pointerX = event.clientX - rect.left;
			const pointerY = event.clientY - rect.top;
			const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;

			setViewport((current) => {
				const transform = createCanvasTransform(rect.width, rect.height, current);
				const worldX = transform.toWorldX(pointerX);
				const worldY = transform.toWorldY(pointerY);
				const zoomed = clampViewport({ ...current, zoom: current.zoom * factor });
				// カーソル下の地点を動かさないよう中心をずらす
				const ratio = current.zoom / zoomed.zoom;
				return clampViewport({
					zoom: zoomed.zoom,
					centerX: worldX - (worldX - current.centerX) * ratio,
					centerY: worldY - (worldY - current.centerY) * ratio,
				});
			});
		};

		canvas.addEventListener('wheel', handleWheel, { passive: false });
		return () => canvas.removeEventListener('wheel', handleWheel);
	}, []);

	const aggregated = shouldAggregateAgents(agents.length, city.districts.length, viewport.zoom);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2">
			<div className="relative flex min-h-0 flex-1">
				<canvas
					ref={canvasRef}
					tabIndex={0}
					aria-label="City Map。矢印キーで Agent を選択できます。ドラッグで移動、ホイールで拡大縮小できます"
					className="min-h-0 w-full flex-1 rounded-md border border-border bg-card focus-visible:outline-2 focus-visible:outline-ring"
					onPointerDown={(event) => {
						dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
						event.currentTarget.setPointerCapture(event.pointerId);
					}}
					onPointerMove={(event) => {
						const drag = dragRef.current;
						// ボタンを離した後の hover でも pointermove は届くため、押下中だけ動かす
						if (drag === null || event.buttons === 0) {
							return;
						}
						const deltaX = event.clientX - drag.x;
						const deltaY = event.clientY - drag.y;
						if (!drag.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) {
							return;
						}
						drag.moved = true;
						drag.x = event.clientX;
						drag.y = event.clientY;

						const rect = event.currentTarget.getBoundingClientRect();
						setViewport((current) => {
							const { scale } = createCanvasTransform(rect.width, rect.height, current);
							return clampViewport({
								...current,
								centerX: current.centerX - deltaX / scale,
								centerY: current.centerY - deltaY / scale,
							});
						});
					}}
					onPointerUp={(event) => {
						event.currentTarget.releasePointerCapture(event.pointerId);
						draggedRef.current = dragRef.current?.moved === true;
						dragRef.current = null;
					}}
					onPointerCancel={() => {
						// タッチのキャンセル等で pointerup / click が来ない場合に掴んだままにしない
						dragRef.current = null;
						draggedRef.current = false;
					}}
					onKeyDown={(event) => {
						// クリック選択のキーボード等価操作。左右キーで Agent を順に選択する
						if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
							return;
						}
						event.preventDefault();
						const next = nextAgentId(agents, selectedAgentId, event.key === 'ArrowRight' ? 1 : -1);
						if (next !== null) {
							onSelectAgent(next);
						}
					}}
					onClick={(event) => {
						// ドラッグ後の click は移動の終わりなので選択に使わない
						const dragged = draggedRef.current;
						draggedRef.current = false;
						const canvas = canvasRef.current;
						if (dragged || canvas === null) {
							return;
						}
						const rect = canvas.getBoundingClientRect();
						const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };

						// 集約中は個々の Agent を選べないため、まずその地区へ寄せる
						const cluster = clusterAt(clustersRef.current, point);
						if (cluster !== null) {
							setViewport(
								clampViewport({
									zoom: CLUSTER_FOCUS_ZOOM,
									centerX: cluster.worldX,
									centerY: cluster.worldY,
								}),
							);
							return;
						}

						const nearest = nearestAgentWithin(agentPositionsRef.current, point);
						if (nearest !== null) {
							onSelectAgent(nearest);
						}
					}}
				/>
				<div className="absolute top-2 right-2 flex items-center gap-1 rounded-md border border-border bg-card/90 px-1.5 py-1 text-xs text-muted-foreground">
					<Button
						size="sm"
						variant="ghost"
						aria-label="縮小"
						disabled={viewport.zoom <= MIN_ZOOM}
						onClick={() => zoomBy(1 / ZOOM_STEP)}
					>
						−
					</Button>
					<span aria-live="polite">{viewport.zoom.toFixed(1)}x</span>
					<Button
						size="sm"
						variant="ghost"
						aria-label="拡大"
						disabled={viewport.zoom >= MAX_ZOOM}
						onClick={() => zoomBy(ZOOM_STEP)}
					>
						＋
					</Button>
					<Button size="sm" variant="ghost" onClick={() => setViewport(DEFAULT_VIEWPORT)}>
						全体表示
					</Button>
				</div>
			</div>
			{aggregated ? (
				<p className="text-xs text-muted-foreground">
					Agent が多いため地区単位で集約表示しています。地区をクリックすると寄ります
				</p>
			) : null}
			<ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
				{SLEEP_STATE_ORDER.map((state) => {
					const presentation = sleepStatePresentation(state);
					return (
						<li key={state} className="flex items-center gap-1">
							<span className={presentation.textClass} aria-hidden>
								{presentation.marker}
							</span>
							<span>{presentation.label}</span>
						</li>
					);
				})}
				{FACILITY_TYPE_ORDER.map((type) => {
					const presentation = facilityPresentation(type);
					return (
						<li key={type} className="flex items-center gap-1">
							<span aria-hidden>{presentation.marker}</span>
							<span>{presentation.label}</span>
						</li>
					);
				})}
				<li className="flex items-center gap-1">
					<span className="text-alert" aria-hidden>
						{ACCIDENT_PRESENTATION.marker}
					</span>
					<span>{ACCIDENT_PRESENTATION.label}</span>
				</li>
				<li className="flex items-center gap-1">
					<span className="text-sleep-deprived" aria-hidden>
						{TRANSMISSION_PRESENTATION.marker}
					</span>
					<span>{TRANSMISSION_PRESENTATION.label}</span>
				</li>
			</ul>
		</div>
	);
}
