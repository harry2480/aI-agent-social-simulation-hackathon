import type { StoredRun } from '@/backend/presentation/composition/simulation.composition';
import type {
	ExperimentConfigParams,
	InterventionName,
	ShockTarget,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import {
	type ExperimentSettings,
	toExperimentConfigParams,
} from '@/frontend/lib/experiment-settings';

/**
 * Simulation 画面のフォーム。
 * Settings 画面で編集できる項目のうち、実行時に変えたくなるものだけを持つ。
 * intervention は Select で扱うため、null ではなく 'none' で表す。
 */
export interface SimulationFormState {
	seed: number;
	population: number;
	days: number;
	initialSleepDeprivedRate: number;
	shockTarget: ShockTarget;
	intervention: InterventionName | 'none';
	aiDecisionEnabled: boolean;
}

/** Settings 画面の保存値をフォームの初期値へ落とす */
export function formFromSettings(settings: ExperimentSettings): SimulationFormState {
	return {
		seed: settings.seed,
		population: settings.population,
		days: settings.days,
		initialSleepDeprivedRate: settings.initialSleepDeprivedRate,
		shockTarget: settings.shockTarget,
		intervention: settings.intervention ?? 'none',
		aiDecisionEnabled: settings.aiDecisionEnabled,
	};
}

/** 保存された Run の Config をフォームの初期値へ戻す。Replay で使う */
export function formFromParams(params: ExperimentConfigParams): SimulationFormState {
	return {
		seed: params.seed,
		population: params.population,
		days: params.days,
		initialSleepDeprivedRate: params.initialSleepDeprivedRate ?? 0,
		shockTarget: params.shockTarget ?? 'none',
		intervention: params.intervention ?? 'none',
		aiDecisionEnabled: params.aiDecisionEnabled === true,
	};
}

/**
 * フォームの値を Run のパラメータへ変換する。
 *
 * Traffic Level や閾値などフォームに無い条件は、Settings 画面の保存値と
 * Replay 元の条件から引き継ぐ。これが無いとリセット時に条件が変わってしまう。
 */
export function toRunParams(
	form: SimulationFormState,
	settings: ExperimentSettings,
	replayParams?: ExperimentConfigParams,
): ExperimentConfigParams {
	return {
		...toExperimentConfigParams(settings),
		...replayParams,
		seed: form.seed,
		population: form.population,
		days: form.days,
		initialSleepDeprivedRate: form.initialSleepDeprivedRate,
		shockTarget: form.shockTarget,
		intervention: form.intervention === 'none' ? null : form.intervention,
		aiDecisionEnabled: form.aiDecisionEnabled,
	};
}

/**
 * Experiment 詳細で時系列を表示する Run を選ぶ。
 * 指定が無い、または指定された Run がその実験に属さない場合は先頭を使う。
 */
export function selectRun(
	runs: readonly StoredRun[],
	requestedRunId: string | undefined,
): StoredRun | null {
	return runs.find((run) => run.id === requestedRunId) ?? runs[0] ?? null;
}
