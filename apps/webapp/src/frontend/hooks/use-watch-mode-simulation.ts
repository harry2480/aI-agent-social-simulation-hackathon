'use client';

import {
	ExperimentConfig,
	type ExperimentConfigParams,
	type SimulationState,
	createWatchModeEngine,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import { SETTINGS_ERROR_MESSAGES } from '@/frontend/lib/experiment-settings';
import {
	type PlaybackSpeed,
	type WatchModeView,
	tickIntervalMs,
	toWatchModeView,
} from '@/frontend/lib/watch-mode-view';
import { useCallback, useEffect, useRef, useState } from 'react';

export type { PlaybackSpeed, WatchModeView };

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
		setView(toWatchModeView(state, finished));
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

	/** 設定が不正な場合のエラー。フォーム入力の検証結果を UI へ返す */
	const [configError, setConfigError] = useState<string | null>(null);

	const initialize = useCallback(
		(params: ExperimentConfigParams) => {
			stop();
			const configResult = ExperimentConfig.create(params);
			if (!configResult.success) {
				// ExperimentConfigError は SettingsError の部分集合。
				// Settings 画面と同じ文言を使い、上限値も同じ定数から出す
				setConfigError(SETTINGS_ERROR_MESSAGES[configResult.error]);
				return;
			}
			setConfigError(null);

			const config = configResult.value;
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
			timerRef.current = setTimeout(loop, tickIntervalMs(speed));
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
		configError,
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
