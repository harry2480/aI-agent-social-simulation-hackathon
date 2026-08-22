import type {
	Agent,
	MetricsSnapshot,
	SimulationEvent,
	SimulationState,
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
	finished: boolean;
}

/** 1x のときに 1 Tick を進める間隔（ミリ秒） */
export const BASE_TICK_INTERVAL_MS = 200;

/** Timeline へ保持する重要 Event の最大件数 */
export const TIMELINE_LIMIT = 60;

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

	return {
		tick: state.clock.tick,
		clockLabel: state.clock.format(),
		agents: state.orderedAgents(),
		recentEvents: significant.slice(-TIMELINE_LIMIT).reverse(),
		metrics: state.metricsHistory.at(-1) ?? null,
		congestedRoadIds: [...state.congestions.keys()],
		finished,
	};
}
