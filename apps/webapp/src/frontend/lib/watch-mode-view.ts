import type {
	Agent,
	MetricsSnapshot,
	SimulationEvent,
	SimulationState,
	SleepTransmission,
} from '@/backend/presentation/composition/watch-mode-engine.composition';

export type PlaybackSpeed = 1 | 4 | 8;

/** 1 Tick 分の画面表示。Hook はこれを state として持つ */
export interface WatchModeView {
	tick: number;
	clockLabel: string;
	agents: Agent[];
	recentEvents: SimulationEvent[];
	metrics: MetricsSnapshot | null;
	congestedRoadIds: string[];
	/** 直近に事故を起こした Agent。City Map で発生地点を示す */
	accidentAgentIds: string[];
	/** 直近の Sleep Transmission。City Map で伝播元 → 伝播先の矢印にする */
	transmissions: MapTransmission[];
	finished: boolean;
}

/** City Map へ渡す伝播 1 件。描画に要る 2 者だけを持つ */
export interface MapTransmission {
	fromAgentId: string;
	toAgentId: string;
}

/** 1x のときに 1 Tick を進める間隔（ミリ秒） */
export const BASE_TICK_INTERVAL_MS = 200;

/** Timeline へ保持する重要 Event の最大件数 */
export const TIMELINE_LIMIT = 60;

/**
 * 事故と Sleep Transmission を City Map に残す Tick 数（1 Tick = 15 分）。
 * 発生した Tick だけに描くと 8x 再生では 25ms しか映らず見落とすため、
 * 1 時間ぶん残して目に留まるようにする。
 */
export const MAP_HIGHLIGHT_TICKS = 4;

/** 再生速度に応じた Tick 間隔。速度を上げるほど間隔が短くなる */
export function tickIntervalMs(speed: PlaybackSpeed): number {
	return BASE_TICK_INTERVAL_MS / speed;
}

/**
 * 実行中の State から画面表示を切り出す。
 *
 * Timeline は重要 Event のみを直近から並べる。全 Tick ログを出すと
 * Decision で埋まって事故・遅延・伝播が見えなくなる（要件定義 37 章）。
 */
export function toWatchModeView(state: SimulationState, finished: boolean): WatchModeView {
	const significant = state.events.filter((event) => event.isSignificant);

	const tick = state.clock.tick;
	return {
		tick,
		clockLabel: state.clock.format(),
		agents: state.orderedAgents(),
		recentEvents: significant.slice(-TIMELINE_LIMIT).reverse(),
		metrics: state.metricsHistory.at(-1) ?? null,
		congestedRoadIds: [...state.congestions.keys()],
		accidentAgentIds: recentAccidentAgentIds(state.events, tick),
		transmissions: recentTransmissions(state.transmissions, tick),
		finished,
	};
}

/** 直近 Tick に事故を起こした Agent。Event は Tick 昇順に積まれるため後ろから見て打ち切る */
function recentAccidentAgentIds(events: readonly SimulationEvent[], tick: number): string[] {
	const since = tick - MAP_HIGHLIGHT_TICKS;
	const agentIds = new Set<string>();

	for (let i = events.length - 1; i >= 0; i--) {
		const event = events[i];
		if (event === undefined || event.tick < since) {
			break;
		}
		if (event.type === 'accident' && event.actorId !== undefined) {
			agentIds.add(event.actorId);
		}
	}

	return [...agentIds];
}

/** 直近 Tick の Sleep Transmission。伝播候補も Tick 昇順に積まれる */
function recentTransmissions(
	transmissions: readonly SleepTransmission[],
	tick: number,
): MapTransmission[] {
	const since = tick - MAP_HIGHLIGHT_TICKS;
	const recent: MapTransmission[] = [];

	for (let i = transmissions.length - 1; i >= 0; i--) {
		const transmission = transmissions[i];
		if (transmission === undefined || transmission.tick < since) {
			break;
		}
		recent.push({
			fromAgentId: transmission.fromAgentId,
			toAgentId: transmission.toAgentId,
		});
	}

	return recent;
}
