'use client';

import type {
	Agent,
	City,
	SleepStateName,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
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

/** 施設座標を 0〜100 の空間で扱い、描画時にキャンバスサイズへスケールする */
const WORLD_SIZE = 110;
const AGENT_RADIUS = 3;

/**
 * City Map。300〜500 Agent を毎 Tick 描画するため、DOM 要素ではなく Canvas を使う。
 * 色は CSS 変数から解決し、描画コード内に色リテラルを持たない。
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
	const agentPositionsRef = useRef<{ id: string; x: number; y: number }[]>([]);

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

		const scale = Math.min(rect.width, rect.height) / WORLD_SIZE;
		const toX = (x: number) => x * scale + (rect.width - WORLD_SIZE * scale) / 2;
		const toY = (y: number) => y * scale + (rect.height - WORLD_SIZE * scale) / 2;

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

		// Agent
		const positions: { id: string; x: number; y: number }[] = [];
		const facilityById = new Map(city.facilities.map((facility) => [facility.id, facility]));
		// 同一施設へ重なる Agent を見分けられるよう、施設内で小さく円状に配置する。
		// 位置は Agent ID から決まるため描画ごとに揺れない
		const perFacilityCount = new Map<string, number>();
		for (const agent of agents) {
			const facility = facilityById.get(agent.currentLocationId);
			if (facility === undefined) {
				continue;
			}
			const indexInFacility = perFacilityCount.get(facility.id) ?? 0;
			perFacilityCount.set(facility.id, indexInFacility + 1);
			const angle = indexInFacility * 2.399963229728653;
			const radius = Math.sqrt(indexInFacility) * 2.2;
			const x = toX(facility.x) + Math.cos(angle) * radius;
			const y = toY(facility.y) + Math.sin(angle) * radius;
			positions.push({ id: agent.id, x, y });

			context.beginPath();
			context.arc(x, y, AGENT_RADIUS, 0, Math.PI * 2);
			context.fillStyle = stateColors[sleepStateOf(agent)];
			context.fill();

			if (agent.id === selectedAgentId) {
				context.beginPath();
				context.arc(x, y, AGENT_RADIUS + 4, 0, Math.PI * 2);
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
					if (agents.length === 0) {
						return;
					}
					const currentIndex = agents.findIndex((agent) => agent.id === selectedAgentId);
					const delta = event.key === 'ArrowRight' ? 1 : -1;
					const nextIndex = (currentIndex + delta + agents.length) % agents.length;
					const next = agents[nextIndex];
					if (next !== undefined) {
						onSelectAgent(next.id);
					}
				}}
				onClick={(event) => {
					const canvas = canvasRef.current;
					if (canvas === null) {
						return;
					}
					const rect = canvas.getBoundingClientRect();
					const x = event.clientX - rect.left;
					const y = event.clientY - rect.top;
					let nearest: { id: string; distance: number } | null = null;
					for (const position of agentPositionsRef.current) {
						const distance = Math.hypot(position.x - x, position.y - y);
						if (nearest === null || distance < nearest.distance) {
							nearest = { id: position.id, distance };
						}
					}
					if (nearest !== null && nearest.distance <= 12) {
						onSelectAgent(nearest.id);
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
