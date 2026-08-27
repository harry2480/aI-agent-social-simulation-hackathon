import {
	type CascadeThresholds,
	DEFAULT_CASCADE_THRESHOLDS,
	DEFAULT_SLEEP_STATE_THRESHOLDS,
	ExperimentConfig,
	type ExperimentConfigError,
	type ExperimentConfigParams,
	type InterventionName,
	MAX_DAYS,
	MAX_INITIAL_SLEEP_DEBT_HOURS,
	MAX_POPULATION,
	MAX_TRAFFIC_LEVEL,
	type ShockTarget,
	type SleepStateThresholds,
} from '@/backend/presentation/composition/watch-mode-engine.composition';

/**
 * Simulation 実行の既定値。
 *
 * ここで編集するのは「これから作る Run の初期値」であり、
 * 実行済みの Run / Experiment は保存時の Config スナップショットを持つため影響を受けない
 * （要件定義 28 章・実装計画 10 章）。
 */
export interface ExperimentSettings {
	seed: number;
	population: number;
	days: number;
	initialSleepDeprivedRate: number;
	initialSleepDebtHours: number;
	shockTarget: ShockTarget;
	trafficLevel: number;
	intervention: InterventionName | null;
	aiDecisionEnabled: boolean;
	sleepStateThresholds: SleepStateThresholds;
	cascadeThresholds: CascadeThresholds;
}

export const DEFAULT_EXPERIMENT_SETTINGS: ExperimentSettings = {
	seed: 42,
	population: 300,
	days: 7,
	initialSleepDeprivedRate: 0.1,
	initialSleepDebtHours: 3,
	shockTarget: 'driver',
	trafficLevel: 1,
	intervention: null,
	aiDecisionEnabled: false,
	sleepStateThresholds: DEFAULT_SLEEP_STATE_THRESHOLDS,
	cascadeThresholds: DEFAULT_CASCADE_THRESHOLDS,
};

/** ブラウザに保存するキー。設定は端末ごとの既定値であり、共有しない */
const EXPERIMENT_SETTINGS_STORAGE_KEY = 'sleep-city.experiment-settings';

/** 設定値の検証エラー。画面はこれをメッセージへ変換して表示する */
export type SettingsError = ExperimentConfigError;

/**
 * 設定値を検証する。
 *
 * 判定は ExperimentConfig.create に委ねる。画面のほうが domain より厳しい状態になると、
 * 画面を通らない経路（API / スクリプト）だけ不正な条件で走ってしまうため、
 * 範囲の定義は domain に一本化する。
 * ここで先に見るのは、不正な設定を保存して次の Run 開始時に初めて失敗するのを防ぐため。
 */
export function validateSettings(settings: ExperimentSettings): SettingsError | null {
	const result = ExperimentConfig.create(toExperimentConfigParams(settings));
	return result.success ? null : result.error;
}

export const SETTINGS_ERROR_MESSAGES: Record<SettingsError, string> = {
	SEED_NOT_INTEGER: 'Seed は整数で入力してください。',
	POPULATION_OUT_OF_RANGE: `Population は 1〜${MAX_POPULATION} の整数で入力してください。`,
	DAYS_OUT_OF_RANGE: `Days は 1〜${MAX_DAYS} の整数で入力してください。`,
	INITIAL_SLEEP_DEPRIVED_RATE_OUT_OF_RANGE: '初期睡眠不足率は 0〜1 で入力してください。',
	INITIAL_SLEEP_DEBT_OUT_OF_RANGE: `初期 Sleep Debt は 0〜${MAX_INITIAL_SLEEP_DEBT_HOURS} 時間で入力してください。`,
	TRAFFIC_LEVEL_OUT_OF_RANGE: `Traffic Level は 0 より大きく ${MAX_TRAFFIC_LEVEL} 以下で入力してください。`,
	SLEEP_STATE_THRESHOLDS_NOT_ASCENDING:
		'睡眠状態の閾値は Tired < Sleep Deprived < Severe の順に大きくしてください。',
	CASCADE_THRESHOLDS_OUT_OF_RANGE:
		'Cascade 判定は Rs > 0・Generation 1 以上・Reach 比率 0〜1 で入力してください。',
};

function finiteNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * 保存された設定を読み戻す。
 *
 * 壊れた値や古い形式が入っていても画面を止めず、既定値で補う。
 * 形が合っていても範囲外（Population 501 など）なら Simulation の初期化が失敗するため、
 * 最後に validateSettings を通し、通らなければ既定値へ戻す。
 */
export function parseSettings(raw: unknown): ExperimentSettings {
	if (typeof raw !== 'object' || raw === null) {
		return DEFAULT_EXPERIMENT_SETTINGS;
	}
	const stored = raw as Partial<Record<keyof ExperimentSettings, unknown>>;
	const defaults = DEFAULT_EXPERIMENT_SETTINGS;

	const thresholds = (stored.sleepStateThresholds ?? {}) as Partial<SleepStateThresholds>;
	const cascade = (stored.cascadeThresholds ?? {}) as Partial<CascadeThresholds>;

	const shockTargets: ShockTarget[] = ['none', 'random', 'driver', 'manager'];
	const interventions: InterventionName[] = [
		'mandatory_rest',
		'overtime_limit',
		'flexible_work',
		'remote_work',
	];

	const parsed: ExperimentSettings = {
		seed: finiteNumber(stored.seed, defaults.seed),
		population: finiteNumber(stored.population, defaults.population),
		days: finiteNumber(stored.days, defaults.days),
		initialSleepDeprivedRate: finiteNumber(
			stored.initialSleepDeprivedRate,
			defaults.initialSleepDeprivedRate,
		),
		initialSleepDebtHours: finiteNumber(
			stored.initialSleepDebtHours,
			defaults.initialSleepDebtHours,
		),
		shockTarget:
			shockTargets.find((candidate) => candidate === stored.shockTarget) ?? defaults.shockTarget,
		trafficLevel: finiteNumber(stored.trafficLevel, defaults.trafficLevel),
		intervention:
			interventions.find((candidate) => candidate === stored.intervention) ?? defaults.intervention,
		aiDecisionEnabled: stored.aiDecisionEnabled === true,
		sleepStateThresholds: {
			tired: finiteNumber(thresholds.tired, defaults.sleepStateThresholds.tired),
			sleepDeprived: finiteNumber(
				thresholds.sleepDeprived,
				defaults.sleepStateThresholds.sleepDeprived,
			),
			severe: finiteNumber(thresholds.severe, defaults.sleepStateThresholds.severe),
		},
		cascadeThresholds: {
			rsThreshold: finiteNumber(cascade.rsThreshold, defaults.cascadeThresholds.rsThreshold),
			minGenerations: finiteNumber(
				cascade.minGenerations,
				defaults.cascadeThresholds.minGenerations,
			),
			minReachRate: finiteNumber(cascade.minReachRate, defaults.cascadeThresholds.minReachRate),
		},
	};

	return validateSettings(parsed) === null ? parsed : DEFAULT_EXPERIMENT_SETTINGS;
}

/** 設定を Run のパラメータへ変換する */
export function toExperimentConfigParams(settings: ExperimentSettings): ExperimentConfigParams {
	return {
		seed: settings.seed,
		population: settings.population,
		days: settings.days,
		initialSleepDeprivedRate: settings.initialSleepDeprivedRate,
		initialSleepDebtHours: settings.initialSleepDebtHours,
		shockTarget: settings.shockTarget,
		trafficLevel: settings.trafficLevel,
		intervention: settings.intervention,
		aiDecisionEnabled: settings.aiDecisionEnabled,
		sleepStateThresholds: settings.sleepStateThresholds,
		cascadeThresholds: settings.cascadeThresholds,
	};
}

/** ブラウザから設定を読む。SSR 中や未保存なら既定値 */
export function loadStoredSettings(): ExperimentSettings {
	if (typeof window === 'undefined') {
		return DEFAULT_EXPERIMENT_SETTINGS;
	}
	const raw = window.localStorage.getItem(EXPERIMENT_SETTINGS_STORAGE_KEY);
	if (raw === null) {
		return DEFAULT_EXPERIMENT_SETTINGS;
	}
	try {
		return parseSettings(JSON.parse(raw));
	} catch {
		// 壊れた値が残っていても画面を止めない
		return DEFAULT_EXPERIMENT_SETTINGS;
	}
}

/** 設定をブラウザへ保存する。呼び出し前に validateSettings で検証すること */
export function saveStoredSettings(settings: ExperimentSettings): void {
	window.localStorage.setItem(EXPERIMENT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
