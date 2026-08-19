/**
 * AI Model 比較（要件定義 45 章 P2 / 実装計画 Step 13）。
 *
 * 同一 Seed・同一都市条件で `AI_MODEL` 相当のモデルだけを変え、Cascade 発生確率の差を比較する。
 * モデル名はソースへ固定せず、必ず `--models=` で渡す（要件定義 13 章）。
 *
 * 使い方:
 *   pnpm --filter webapp exec tsx scripts/compare-ai-models.ts \
 *     --models=google/gemma-3-27b-it,qwen/qwen-2.5-72b-instruct --seeds=3
 *
 * OPENROUTER_API_KEY が未設定の場合はすべてのモデルが Rule-based へ縮退するため、
 * 比較として意味を持たない。その旨を警告したうえで実行する。
 * DATABASE_URL が設定されていれば結果を Experiment（kind = ai-model-comparison）として保存する。
 */
import type { RunSimulationUseCase } from '../src/backend/application/usecases/run-simulation.usecase';
import {
	ExperimentConfig,
	type ExperimentConfigParams,
} from '../src/backend/domain/models/experiment-config.model';
import type { RunSummary } from '../src/backend/domain/models/metrics.model';

/** 比較で固定する条件。変えるのはモデルだけ（要件定義 28 章） */
const BASE: ExperimentConfigParams = {
	seed: 0,
	population: 150,
	days: 5,
	initialSleepDeprivedRate: 0.1,
	shockTarget: 'driver',
	aiDecisionEnabled: true,
};

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

function parseArgs(): { models: string[]; seeds: number } {
	const args = process.argv.slice(2);
	const get = (name: string): string | undefined =>
		args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];

	const models = (get('models') ?? '')
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
	if (models.length === 0) {
		throw new Error('--models=<model-id>[,<model-id>...] を指定してください');
	}
	return { models, seeds: parseSeeds(get('seeds'), 3) };
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

function standardDeviation(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
	const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
	return Math.sqrt(variance);
}

async function runOnce(
	runner: RunSimulationUseCase,
	params: ExperimentConfigParams,
	experimentId: string | null,
	persist: boolean,
): Promise<RunSummary> {
	const configResult = ExperimentConfig.create(params);
	if (!configResult.success) {
		throw new Error(`invalid config: ${configResult.error}`);
	}
	const result = await runner.execute({ config: configResult.value, experimentId, persist });
	return result.summary;
}

async function main(): Promise<void> {
	const { models, seeds } = parseArgs();

	if (process.env.OPENROUTER_API_KEY === undefined) {
		console.warn(
			'[ai-model] OPENROUTER_API_KEY 未設定のため、全モデルが Rule-based へ縮退します（比較になりません）',
		);
	}

	const persists = process.env.DATABASE_URL !== undefined;
	if (!persists) {
		console.log('[ai-model] DATABASE_URL 未設定のため保存をスキップします');
	}

	// 保存は infrastructure を直接使わず composition 経由で解決する
	const composition = await import(
		'../src/backend/presentation/composition/simulation.composition'
	);
	const experimentId = persists
		? await composition.experimentRepository.create({
				name: `ai-model comparison (${models.length} models / ${seeds} seeds)`,
				kind: 'ai-model-comparison',
				config: { base: BASE, seeds, models },
			})
		: null;

	console.log(`[ai-model] models=${models.join(', ')} seeds=${seeds}`);
	const results: Aggregate[] = [];

	for (const model of models) {
		const runner = composition.createModelComparisonRunSimulationUseCase(model);
		const summaries: RunSummary[] = [];
		const startedAt = Date.now();

		for (let seed = 1; seed <= seeds; seed++) {
			summaries.push(
				await runOnce(runner, { ...BASE, seed, aiModel: model }, experimentId, persists),
			);
		}

		const reaches = summaries.map((summary) => summary.cascadeReach);
		const aggregate: Aggregate = {
			label: model,
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
		results.push(aggregate);

		console.log(
			`  ${model.padEnd(36)} reach=${aggregate.averageReach.toFixed(1)} ` +
				`sd=${aggregate.standardDeviation.toFixed(1)} avgRs=${aggregate.averageRs.toFixed(2)} ` +
				`peakRs=${aggregate.peakRs.toFixed(2)} cascadeP=${(aggregate.cascadeProbability * 100).toFixed(0)}% ` +
				`(${Date.now() - startedAt}ms)`,
		);
	}

	if (experimentId === null) {
		return;
	}
	await composition.experimentRepository.saveResults(
		experimentId,
		results.map((result) => ({ ...result, aggregate: result })),
	);
	console.log(`[ai-model] saved: experimentId=${experimentId}`);
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
