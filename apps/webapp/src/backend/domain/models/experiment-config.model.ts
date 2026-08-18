import { type CityLayoutConfig, DEFAULT_CITY_LAYOUT } from './city.model';
import { DEFAULT_SLEEP_STATE_THRESHOLDS, type SleepStateThresholds } from './sleep-state.model';

export type ShockTarget = 'none' | 'random' | 'driver' | 'manager';

export type InterventionName =
	| 'mandatory_rest'
	| 'overtime_limit'
	| 'flexible_work'
	| 'remote_work';

/** Sleep Cascade の判定条件。要件定義 24 章 */
export interface CascadeThresholds {
	/** Rs がこの値を超えている Generation を Cascade 継続とみなす */
	rsThreshold: number;
	/** Rs 超過が継続すべき Generation 数 */
	minGenerations: number;
	/** Cascade Reach が Population に占める比率の下限 */
	minReachRate: number;
}

export const DEFAULT_CASCADE_THRESHOLDS: CascadeThresholds = {
	rsThreshold: 1,
	minGenerations: 2,
	minReachRate: 0.1,
};

export interface ExperimentConfigParams {
	seed: number;
	population: number;
	days: number;
	initialSleepDeprivedRate: number;
	initialSleepDebtHours?: number;
	shockTarget?: ShockTarget;
	/** 交通量の基準値。1 で標準 */
	trafficLevel?: number;
	intervention?: InterventionName | null;
	aiModel?: string;
	sleepStateThresholds?: SleepStateThresholds;
	cascadeThresholds?: CascadeThresholds;
	cityLayout?: CityLayoutConfig;
	/** AI Decision を有効にするか。Experiment Mode では false にして Rule-based で回す */
	aiDecisionEnabled?: boolean;
}

const MAX_POPULATION = 500;
const MAX_DAYS = 14;

/**
 * 実験条件。比較実験ではこの中の Experimental Variable だけを変更し、
 * Population・Agent 属性・City 構造・Seed・初期交通量は固定する（要件定義 28 章）。
 */
export class ExperimentConfig {
	private constructor(
		public readonly seed: number,
		public readonly population: number,
		public readonly days: number,
		public readonly initialSleepDeprivedRate: number,
		public readonly initialSleepDebtHours: number,
		public readonly shockTarget: ShockTarget,
		public readonly trafficLevel: number,
		public readonly intervention: InterventionName | null,
		public readonly aiModel: string | null,
		public readonly sleepStateThresholds: SleepStateThresholds,
		public readonly cascadeThresholds: CascadeThresholds,
		public readonly cityLayout: CityLayoutConfig,
		public readonly aiDecisionEnabled: boolean,
	) {}

	static create(params: ExperimentConfigParams): ExperimentConfig {
		if (!Number.isInteger(params.seed)) {
			throw new Error(`ExperimentConfig: seed must be an integer, got ${params.seed}`);
		}
		if (params.population < 1 || params.population > MAX_POPULATION) {
			throw new Error(`ExperimentConfig: population must be 1..${MAX_POPULATION}`);
		}
		if (params.days < 1 || params.days > MAX_DAYS) {
			throw new Error(`ExperimentConfig: days must be 1..${MAX_DAYS}`);
		}
		if (params.initialSleepDeprivedRate < 0 || params.initialSleepDeprivedRate > 1) {
			throw new Error('ExperimentConfig: initialSleepDeprivedRate must be 0..1');
		}

		return new ExperimentConfig(
			params.seed,
			params.population,
			params.days,
			params.initialSleepDeprivedRate,
			params.initialSleepDebtHours ?? 3,
			params.shockTarget ?? 'none',
			params.trafficLevel ?? 1,
			params.intervention ?? null,
			params.aiModel ?? null,
			params.sleepStateThresholds ?? DEFAULT_SLEEP_STATE_THRESHOLDS,
			params.cascadeThresholds ?? DEFAULT_CASCADE_THRESHOLDS,
			params.cityLayout ?? DEFAULT_CITY_LAYOUT,
			params.aiDecisionEnabled ?? false,
		);
	}

	/** 比較実験用に一部条件だけを差し替えた Config を作る */
	withOverrides(overrides: Partial<ExperimentConfigParams>): ExperimentConfig {
		return ExperimentConfig.create({
			seed: overrides.seed ?? this.seed,
			population: overrides.population ?? this.population,
			days: overrides.days ?? this.days,
			initialSleepDeprivedRate: overrides.initialSleepDeprivedRate ?? this.initialSleepDeprivedRate,
			initialSleepDebtHours: overrides.initialSleepDebtHours ?? this.initialSleepDebtHours,
			shockTarget: overrides.shockTarget ?? this.shockTarget,
			trafficLevel: overrides.trafficLevel ?? this.trafficLevel,
			intervention:
				overrides.intervention !== undefined ? overrides.intervention : this.intervention,
			aiModel: overrides.aiModel ?? this.aiModel ?? undefined,
			sleepStateThresholds: overrides.sleepStateThresholds ?? this.sleepStateThresholds,
			cascadeThresholds: overrides.cascadeThresholds ?? this.cascadeThresholds,
			cityLayout: overrides.cityLayout ?? this.cityLayout,
			aiDecisionEnabled: overrides.aiDecisionEnabled ?? this.aiDecisionEnabled,
		});
	}

	get totalTicks(): number {
		return this.days * 96;
	}
}
