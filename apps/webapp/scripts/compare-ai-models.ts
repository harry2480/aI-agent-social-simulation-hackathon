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
	type ConditionAggregate,
	aggregateSummaries,
} from '../src/backend/domain/models/experiment-aggregate.model';
import {
	ExperimentConfig,
	type ExperimentConfigParams,
} from '../src/backend/domain/models/experiment-config.model';
import type { RunSummary } from '../src/backend/domain/models/metrics.model';
import { argValue, formatAggregateLine, parseSeeds } from './lib/experiment-aggregate';

/** 比較で固定する条件。変えるのはモデルだけ（要件定義 28 章） */
const BASE: ExperimentConfigParams = {
	seed: 0,
	population: 150,
	days: 5,
	initialSleepDeprivedRate: 0.1,
	shockTarget: 'driver',
	aiDecisionEnabled: true,
};

function parseArgs(): { models: string[]; seeds: number } {
	const args = process.argv.slice(2);

	const models = (argValue(args, 'models') ?? '')
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
	if (models.length === 0) {
		throw new Error('--models=<model-id>[,<model-id>...] を指定してください');
	}
	return { models, seeds: parseSeeds(argValue(args, 'seeds'), 3) };
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
	const results: ConditionAggregate[] = [];

	for (const model of models) {
		const runner = composition.createModelComparisonRunSimulationUseCase(model);
		const summaries: RunSummary[] = [];
		const startedAt = Date.now();

		for (let seed = 1; seed <= seeds; seed++) {
			summaries.push(
				await runOnce(runner, { ...BASE, seed, aiModel: model }, experimentId, persists),
			);
		}

		const aggregate = aggregateSummaries(model, summaries);
		results.push(aggregate);

		console.log(`${formatAggregateLine(aggregate, 36)} (${Date.now() - startedAt}ms)`);
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
