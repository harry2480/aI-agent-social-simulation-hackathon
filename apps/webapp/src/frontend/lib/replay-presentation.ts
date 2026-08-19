import type {
	ExperimentConfigParams,
	InterventionName,
	ShockTarget,
} from '@/backend/presentation/composition/watch-mode-engine.composition';

const SHOCK_TARGETS: ShockTarget[] = ['none', 'random', 'driver', 'manager'];
const INTERVENTIONS: InterventionName[] = [
	'mandatory_rest',
	'overtime_limit',
	'flexible_work',
	'remote_work',
];

interface StoredConfigFields {
	seed?: unknown;
	population?: unknown;
	days?: unknown;
	initialSleepDeprivedRate?: unknown;
	initialSleepDebtHours?: unknown;
	shockTarget?: unknown;
	trafficLevel?: unknown;
	aiModel?: unknown;
	intervention?: unknown;
	aiDecisionEnabled?: unknown;
}

function finiteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * 保存された Run の Config スナップショットを再実行用のパラメータへ戻す。
 *
 * Simulation Engine は同一 Seed・同一 Config なら同一結果を返すため（要件定義 44 章）、
 * Event 列を復元するのではなく、保存された条件で再実行することを Replay とする。
 * Seed・Population・Days が読み取れない Config は再実行できないので null を返す。
 */
export function parseReplayParams(config: unknown): ExperimentConfigParams | null {
	if (typeof config !== 'object' || config === null) {
		return null;
	}
	const fields = config as StoredConfigFields;

	const seed = finiteNumber(fields.seed);
	const population = finiteNumber(fields.population);
	const days = finiteNumber(fields.days);
	if (seed === null || population === null || days === null) {
		return null;
	}

	const shockTarget = SHOCK_TARGETS.find((candidate) => candidate === fields.shockTarget);
	const intervention = INTERVENTIONS.find((candidate) => candidate === fields.intervention);

	return {
		seed,
		population,
		days,
		initialSleepDeprivedRate: finiteNumber(fields.initialSleepDeprivedRate) ?? 0,
		initialSleepDebtHours: finiteNumber(fields.initialSleepDebtHours) ?? undefined,
		shockTarget: shockTarget ?? 'none',
		trafficLevel: finiteNumber(fields.trafficLevel) ?? undefined,
		// 実行に使うモデルはサーバーの環境変数が決めるが、保存時のモデルは条件として残す
		aiModel: typeof fields.aiModel === 'string' ? fields.aiModel : undefined,
		intervention: intervention ?? null,
		aiDecisionEnabled: fields.aiDecisionEnabled === true,
	};
}

/** Replay 中であることを示すラベル */
export function replayLabel(params: ExperimentConfigParams): string {
	const parts = [
		`seed ${params.seed}`,
		`${params.population} agents`,
		`${params.days} days`,
		`shock: ${params.shockTarget ?? 'none'}`,
	];
	if (params.intervention != null) {
		parts.push(`intervention: ${params.intervention}`);
	}
	return parts.join(' / ');
}
