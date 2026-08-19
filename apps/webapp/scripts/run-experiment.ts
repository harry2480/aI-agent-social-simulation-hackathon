/**
 * Experiment Mode の Batch Runner。
 *
 * 重い Batch（Multi-seed / Sweep）は Vercel Function の実行時間上限に当たるため、
 * Route Handler ではなくこのスクリプトで実行し、結果のみ DB へ保存する。
 *
 * 使い方:
 *   pnpm --filter webapp exec tsx scripts/run-experiment.ts --kind=shock-comparison --seeds=10
 *   pnpm --filter webapp exec tsx scripts/run-experiment.ts --kind=critical-point --seeds=10
 *   pnpm --filter webapp exec tsx scripts/run-experiment.ts --kind=intervention --seeds=10
 *
 * DATABASE_URL が設定されていない場合は保存せず、集計結果を標準出力へ出す。
 * Run 単位（Agent / Event / Metrics）の保存は Experiment 詳細画面の時系列グラフに必要なため
 * 既定で行う。集計だけが欲しい場合は --save-runs=false を付ける。
 */
import type { RunSimulationUseCase } from '../src/backend/application/usecases/run-simulation.usecase';
import {
	ExperimentConfig,
	type ExperimentConfigParams,
} from '../src/backend/domain/models/experiment-config.model';
import type { RunSummary } from '../src/backend/domain/models/metrics.model';
import { SimulationEngine } from '../src/backend/domain/services/simulation-engine.service';
import { RuleBasedAiDecisionGateway } from '../src/backend/infrastructure/adapters/rule-based-ai-decision.adapter';

type ExperimentKind = 'shock-comparison' | 'critical-point' | 'intervention';

interface Condition {
	label: string;
	overrides: Partial<ExperimentConfigParams>;
}

interface Aggregate {
	label: string;
	runCount: number;
	cascadeProbability: number;
	averageRs: number;
	peakRs: number;
	averageReach: number;
	totalSleepLossMinutes: number;
	standardDeviation: number;
}

const BASE: ExperimentConfigParams = {
	seed: 0,
	population: 300,
	days: 7,
	initialSleepDeprivedRate: 0.1,
	shockTarget: 'driver',
};

const CONDITIONS: Record<ExperimentKind, Condition[]> = {
	'shock-comparison': [
		{ label: 'baseline', overrides: { shockTarget: 'none', initialSleepDeprivedRate: 0 } },
		{ label: 'random-shock', overrides: { shockTarget: 'random' } },
		{ label: 'driver-shock', overrides: { shockTarget: 'driver' } },
		{ label: 'manager-shock', overrides: { shockTarget: 'manager' } },
	],
	'critical-point': [0.01, 0.03, 0.05, 0.07, 0.1, 0.15, 0.2].map((rate) => ({
		label: `initial-rate-${Math.round(rate * 100)}%`,
		overrides: { initialSleepDeprivedRate: rate },
	})),
	intervention: [
		{ label: 'none', overrides: { intervention: null } },
		{ label: 'mandatory-rest', overrides: { intervention: 'mandatory_rest' } },
		{ label: 'overtime-limit', overrides: { intervention: 'overtime_limit' } },
		{ label: 'flexible-work', overrides: { intervention: 'flexible_work' } },
		{ label: 'remote-work', overrides: { intervention: 'remote_work' } },
	],
};

function parseArgs(): { kind: ExperimentKind; seeds: number; saveRuns: boolean } {
	const args = process.argv.slice(2);
	const get = (name: string): string | undefined =>
		args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];

	const kind = (get('kind') ?? 'shock-comparison') as ExperimentKind;
	if (!(kind in CONDITIONS)) {
		throw new Error(`unknown kind: ${kind}. use ${Object.keys(CONDITIONS).join(' | ')}`);
	}
	return {
		kind,
		seeds: parseSeeds(get('seeds'), 10),
		saveRuns: get('save-runs') !== 'false',
	};
}

/**
 * Seed 数を読み取る。
 * 不正値のまま進むと Run が 1 本も回らず、NaN や -Infinity の集計が DB へ保存される。
 */
function parseSeeds(raw: string | undefined, fallback: number): number {
	if (raw === undefined) {
		return fallback;
	}
	const seeds = Number(raw);
	if (!Number.isInteger(seeds) || seeds < 1) {
		throw new Error('--seeds には 1 以上の整数を指定してください');
	}
	return seeds;
}

/**
 * Run を 1 本実行する。
 * runner が渡された場合は Run 単位の詳細（Agent / Event / Causal Edge / Metrics）も保存する。
 */
async function runOnce(
	params: ExperimentConfigParams,
	runner: RunSimulationUseCase | null,
	experimentId: string | null,
): Promise<RunSummary> {
	const configResult = ExperimentConfig.create(params);
	if (!configResult.success) {
		throw new Error(`invalid experiment config: ${configResult.error}`);
	}

	if (runner !== null) {
		const result = await runner.execute({
			config: configResult.value,
			experimentId,
			persist: true,
		});
		return result.summary;
	}

	// Experiment Mode は Rule-based 固定。AI の非決定性を排除し、大量実行のコストを抑える
	const engine = SimulationEngine.create(configResult.value, new RuleBasedAiDecisionGateway());
	return engine.run(engine.initialize());
}

function standardDeviation(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
	const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
	return Math.sqrt(variance);
}

async function aggregate(
	condition: Condition,
	seeds: number,
	runner: RunSimulationUseCase | null,
	experimentId: string | null,
): Promise<Aggregate> {
	const summaries: RunSummary[] = [];
	for (let seed = 1; seed <= seeds; seed++) {
		summaries.push(await runOnce({ ...BASE, ...condition.overrides, seed }, runner, experimentId));
	}

	const reaches = summaries.map((summary) => summary.cascadeReach);
	return {
		label: condition.label,
		runCount: summaries.length,
		cascadeProbability:
			summaries.filter((summary) => summary.cascadeOccurred).length / summaries.length,
		averageRs: summaries.reduce((sum, s) => sum + s.averageRs, 0) / summaries.length,
		peakRs: Math.max(...summaries.map((summary) => summary.peakRs)),
		averageReach: reaches.reduce((sum, value) => sum + value, 0) / reaches.length,
		totalSleepLossMinutes:
			summaries.reduce((sum, s) => sum + s.totalSleepLossMinutes, 0) / summaries.length,
		standardDeviation: standardDeviation(reaches),
	};
}

async function main(): Promise<void> {
	const { kind, seeds, saveRuns } = parseArgs();
	const conditions = CONDITIONS[kind];
	console.log(`[experiment] kind=${kind} seeds=${seeds} conditions=${conditions.length}`);

	const persists = process.env.DATABASE_URL !== undefined;
	if (!persists) {
		console.log('[experiment] DATABASE_URL 未設定のため保存をスキップします');
	}

	// 保存は infrastructure を直接使わず composition 経由で解決する。
	// DATABASE_URL が無い環境では Prisma を読み込まないよう、import 自体を遅延させる
	const composition = persists
		? await import('../src/backend/presentation/composition/simulation.composition')
		: null;

	// Run を experimentId へ紐付けるため、実験レコードは実行前に作る
	const experimentId =
		composition === null
			? null
			: await composition.experimentRepository.create({
					name: `${kind} (${seeds} seeds)`,
					kind,
					config: { base: BASE, seeds, conditions: conditions.map((c) => c.label) },
				});
	const runner =
		composition === null || !saveRuns ? null : composition.createExperimentRunSimulationUseCase();

	const results: Aggregate[] = [];
	for (const condition of conditions) {
		const startedAt = Date.now();
		const result = await aggregate(condition, seeds, runner, experimentId);
		results.push(result);
		console.log(
			`  ${result.label.padEnd(20)} reach=${result.averageReach.toFixed(1)} ` +
				`sd=${result.standardDeviation.toFixed(1)} avgRs=${result.averageRs.toFixed(2)} ` +
				`peakRs=${result.peakRs.toFixed(2)} cascadeP=${(result.cascadeProbability * 100).toFixed(0)}% ` +
				`(${Date.now() - startedAt}ms)`,
		);
	}

	if (composition === null || experimentId === null) {
		return;
	}

	await composition.experimentRepository.saveResults(
		experimentId,
		results.map((result) => ({ ...result, aggregate: result })),
	);
	console.log(
		`[experiment] saved: experimentId=${experimentId} runs=${saveRuns ? conditions.length * seeds : 0}`,
	);
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
