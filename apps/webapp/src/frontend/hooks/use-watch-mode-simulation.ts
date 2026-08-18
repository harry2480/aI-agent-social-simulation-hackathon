'use client';

import {
	type Agent,
	ExperimentConfig,
	type ExperimentConfigParams,
	type MetricsSnapshot,
	type SimulationEvent,
	type SimulationState,
	createWatchModeEngine,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import { useCallback, useEffect, useRef, useState } from 'react';

export type PlaybackSpeed = 1 | 4 | 8;

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
const BASE_TICK_INTERVAL_MS = 200;
/** Timeline へ保持する重要 Event の最大件数 */
const TIMELINE_LIMIT = 60;

/**
 * Watch Mode の Simulation をブラウザ内で駆動する。
 *
 * 1 Tick の計算は 300 Agent でも 1ms 未満で完了し、再生速度に応じたインターバルで
 * 呼び出すため、メインスレッドで実行しても UI 操作を阻害しない。
 */
export function useWatchModeSimulation() {
	const engineRef = useRef<ReturnType<typeof createWatchModeEngine> | null>(null);
	const stateRef = useRef<SimulationState | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const runningRef = useRef(false);

	const [view, setView] = useState<WatchModeView | null>(null);
	const [isRunning, setIsRunning] = useState(false);
	const [speed, setSpeed] = useState<PlaybackSpeed>(4);

	const publish = useCallback((state: SimulationState, finished: boolean) => {
		const significant = state.events.filter((event) => event.isSignificant);
		setView({
			tick: state.clock.tick,
			clockLabel: state.clock.format(),
			agents: state.orderedAgents(),
			recentEvents: significant.slice(-TIMELINE_LIMIT).reverse(),
			metrics: state.metricsHistory.at(-1) ?? null,
			congestedRoadIds: [...state.congestions.keys()],
			finished,
		});
	}, []);

	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const stop = useCallback(() => {
		runningRef.current = false;
		setIsRunning(false);
		clearTimer();
	}, [clearTimer]);

	const initialize = useCallback(
		(params: ExperimentConfigParams) => {
			stop();
			const config = ExperimentConfig.create(params);
			// AI Decision は Route Handler を経由するため、API キーはクライアントへ渡らない
			const engine = createWatchModeEngine(config, {
				aiDecisionEnabled: config.aiDecisionEnabled,
			});
			const state = engine.initialize();
			engineRef.current = engine;
			stateRef.current = state;
			publish(state, false);
		},
		[publish, stop],
	);

	const step = useCallback(async () => {
		const engine = engineRef.current;
		const state = stateRef.current;
		if (engine === null || state === null) {
			return false;
		}
		if (state.clock.tick >= state.config.totalTicks) {
			return false;
		}
		await engine.runTick(state);
		publish(state, state.clock.tick >= state.config.totalTicks);
		return true;
	}, [publish]);

	useEffect(() => {
		if (!isRunning) {
			return;
		}
		runningRef.current = true;

		let cancelled = false;
		const loop = async () => {
			if (cancelled || !runningRef.current) {
				return;
			}
			const advanced = await step();
			if (!advanced) {
				stop();
				return;
			}
			if (cancelled || !runningRef.current) {
				return;
			}
			timerRef.current = setTimeout(loop, BASE_TICK_INTERVAL_MS / speed);
		};
		void loop();

		return () => {
			cancelled = true;
			clearTimer();
		};
	}, [isRunning, speed, step, stop, clearTimer]);

	useEffect(() => clearTimer, [clearTimer]);

	/** 現時点の Run サマリを算出する。保存時に使う */
	const summarize = useCallback(() => {
		const engine = engineRef.current;
		const state = stateRef.current;
		if (engine === null || state === null) {
			return null;
		}
		return engine.summarize(state);
	}, []);

	return {
		view,
		isRunning,
		speed,
		setSpeed,
		initialize,
		start: () => setIsRunning(true),
		pause: stop,
		stateRef,
		summarize,
	};
}
