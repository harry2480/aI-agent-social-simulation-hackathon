/**
 * Experiment Mode の Batch Runner。
 *
 * ブラウザからも同じ実験を回せる（Experiment Dashboard の「実験を実行する」）が、
 * こちらは Run 単位（Agent / Event / Metrics）まで保存できる。
 * 大量の Seed を回す場合や、Run の時系列グラフが要る場合はこのスクリプトを使う。
 *
 * 使い方:
 *   pnpm --filter webapp exec tsx scripts/run-experiment.ts --kind=shock-comparison --seeds=10
 *   pnpm --filter webapp exec tsx scripts/run-experiment.ts --kind=critical-point --seeds=10
 *   pnpm --filter webapp exec tsx scripts/run-experiment.ts --kind=intervention --seeds=10
 *   pnpm --filter webapp exec tsx scripts/run-experiment.ts --kind=cascade-threshold --seeds=10
 *
 * DATABASE_URL が設定されていない場合は保存せず、集計結果を標準出力へ出す。
 * Run 単位の保存は Experiment 詳細画面の時系列グラフに必要なため既定で行う。
 * 集計だけが欲しい場合は --save-runs=false を付ける。
 */
import { RunExperimentUseCase } from '../src/backend/application/usecases/run-experiment.usecase';
import { buildRunPersistencePayload } from '../src/backend/application/usecases/run-simulation.usecase';
import type { ConditionAggregate } from '../src/backend/domain/models/experiment-aggregate.model';
import {
	BATCH_EXPERIMENT_KINDS,
	type BatchExperimentKind,
	DEFAULT_BATCH_BASE,
	experimentPlanOf,
	isBatchExperimentKind,
} from '../src/backend/domain/models/experiment-plan.model';
import { RuleBasedAiDecisionGateway } from '../src/backend/infrastructure/adapters/rule-based-ai-decision.adapter';
import { argValue, formatAggregateLine, parseSeeds } from './lib/experiment-aggregate';

function parseArgs(): { kind: BatchExperimentKind; seeds: number; saveRuns: boolean } {
	const args = process.argv.slice(2);

	const kind = argValue(args, 'kind') ?? 'shock-comparison';
	if (!isBatchExperimentKind(kind)) {
		throw new Error(`unknown kind: ${kind}. use ${BATCH_EXPERIMENT_KINDS.join(' | ')}`);
	}
	return {
		kind,
		seeds: parseSeeds(argValue(args, 'seeds'), 10),
		saveRuns: argValue(args, 'save-runs') !== 'false',
	};
}

async function main(): Promise<void> {
	const { kind, seeds, saveRuns } = parseArgs();
	const plan = experimentPlanOf(kind);
	console.log(`[experiment] kind=${kind} seeds=${seeds} conditions=${plan.conditions.length}`);

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
					config: {
						base: DEFAULT_BATCH_BASE,
						seeds,
						conditions: plan.conditions.map((condition) => condition.label),
					},
				});

	const startedAt = Date.now();
	// 進捗は Run ごとに届くが、Sweep では 70 行になるため条件が変わったときだけ出す
	let loggedLabel: string | null = null;
	const results: ConditionAggregate[] = await new RunExperimentUseCase(
		new RuleBasedAiDecisionGateway(),
	).execute({
		kind,
		seeds,
		onProgress: ({ done, total, label }) => {
			if (label === loggedLabel) {
				return;
			}
			loggedLabel = label;
			console.log(`[experiment] ${done}/${total} ${label}`);
		},
		onRunFinished:
			composition === null || !saveRuns
				? undefined
				: async ({ state, summary }) => {
						await composition.simulationRunRepository.save(
							buildRunPersistencePayload(state, summary, experimentId),
						);
					},
	});

	for (const result of results) {
		console.log(formatAggregateLine(result, 28));
	}
	console.log(`[experiment] finished in ${Date.now() - startedAt}ms`);

	if (composition === null || experimentId === null) {
		return;
	}

	await composition.experimentRepository.saveResults(
		experimentId,
		results.map((result) => ({ ...result, aggregate: result })),
	);
	console.log(`[experiment] saved: experimentId=${experimentId} runs=${saveRuns ? 'yes' : 'no'}`);
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
