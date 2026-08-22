'use client';

import type {
	Agent,
	City,
	SleepStateName,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import {
	AGENT_RADIUS,
	type AgentPosition,
	agentPositions,
	createCanvasTransform,
	nearestAgentWithin,
	nextAgentId,
} from '@/frontend/lib/city-map-layout';
import {
	SLEEP_STATE_ORDER,
	sleepStateColorVars,
	sleepStatePresentation,
} from '@/frontend/lib/sleep-state-presentation';
import { useEffect, useRef } from 'react';

interface CityMapProps {
	city: City;
	agents: Agent[];
	sleepStateOf: (agent: Agent) => SleepStateName;
	congestedRoadIds: readonly string[];
	selectedAgentId: string | null;
	onSelectAgent: (agentId: string) => void;
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
	selectedAgentId,
	onSelectAgent,
}: CityMapProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const agentPositionsRef = useRef<AgentPosition[]>([]);

	useEffect(() => {
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

		const transform = createCanvasTransform(rect.width, rect.height);
		const { scale, toX, toY } = transform;

		const styles = getComputedStyle(canvas);
		const borderColor = styles.getPropertyValue('--color-border').trim() || '#d4d4d8';
		const mutedColor = styles.getPropertyValue('--color-muted-foreground').trim() || '#71717a';
		const alertColor = styles.getPropertyValue('--color-alert').trim() || '#dc2626';
		const foreground = styles.getPropertyValue('--color-foreground').trim() || '#18181b';
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

		// Agent。選択判定に使うため描画位置を保持する
		const positions = agentPositions(agents, city.facilities, transform);
		const stateById = new Map(agents.map((agent) => [agent.id, sleepStateOf(agent)]));
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
		agentPositionsRef.current = positions;
	}, [city, agents, sleepStateOf, congestedRoadIds, selectedAgentId]);

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2">
			<canvas
				ref={canvasRef}
				tabIndex={0}
				aria-label="City Map。矢印キーで Agent を選択できます"
				className="min-h-0 w-full flex-1 rounded-md border border-border bg-card focus-visible:outline-2 focus-visible:outline-ring"
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
					const canvas = canvasRef.current;
					if (canvas === null) {
						return;
					}
					const rect = canvas.getBoundingClientRect();
					const nearest = nearestAgentWithin(agentPositionsRef.current, {
						x: event.clientX - rect.left,
						y: event.clientY - rect.top,
					});
					if (nearest !== null) {
						onSelectAgent(nearest);
					}
				}}
			/>
			<ul className="flex flex-wrap gap-3 text-xs text-muted-foreground">
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
			</ul>
		</div>
	);
}
