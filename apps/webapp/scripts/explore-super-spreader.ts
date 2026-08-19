/**
 * Sleep Super-spreader Explorer（要件定義 31 章）の実行スクリプト。
 *
 * 全 Agent を Patient Zero 候補として評価するため Run 回数が Population に比例する。
 * Vercel Function 上では完走しないため、ローカル実行専用とする。
 *
 * 使い方:
 *   pnpm --filter webapp exec tsx scripts/explore-super-spreader.ts
 *   pnpm --filter webapp exec tsx scripts/explore-super-spreader.ts --population=300 --days=7 --top=10
 *
 * DATABASE_URL が設定されていれば Stage 2 のランキングを Experiment として保存し、
 * `/super-spreader` から参照できるようにする。未設定なら標準出力のみ。
 */
import { ExploreSuperSpreaderUseCase } from '../src/backend/application/usecases/explore-super-spreader.usecase';
import { ExperimentConfig } from '../src/backend/domain/models/experiment-config.model';
import { RuleBasedAiDecisionGateway } from '../src/backend/infrastructure/adapters/rule-based-ai-decision.adapter';

/** Stage 2 で使う Seed 群。保存する config と実行条件を一致させるため 1 箇所に置く */
const STAGE2_SEEDS = [1, 2, 3];

function arg(name: string, fallback: number): number {
	const raw = process.argv
		.slice(2)
		.find((value) => value.startsWith(`--${name}=`))
		?.split('=')[1];
	return raw === undefined ? fallback : Number(raw);
}

async function main(): Promise<void> {
	const population = arg('population', 150);
	const days = arg('days', 3);
	const topN = arg('top', 10);
	const limit = arg('limit', Number.POSITIVE_INFINITY);

	const configResult = ExperimentConfig.create({
		seed: 42,
		population,
		days,
		initialSleepDeprivedRate: 0,
		initialSleepDebtHours: 4,
		shockTarget: 'none',
	});
	if (!configResult.success) {
		throw new Error(`invalid config: ${configResult.error}`);
	}

	// Stage 2 も Rule-based で回す。OpenRouter を使う場合はここを差し替える
	const useCase = new ExploreSuperSpreaderUseCase(
		new RuleBasedAiDecisionGateway(),
		new RuleBasedAiDecisionGateway(),
	);

	console.log(`[super-spreader] population=${population} days=${days} top=${topN}`);
	const startedAt = Date.now();
	const result = await useCase.execute({
		baseConfig: configResult.value,
		stage1AgentLimit: Number.isFinite(limit) ? limit : undefined,
		stage2TopN: topN,
		stage2Seeds: STAGE2_SEEDS,
		onProgress: ({ stage, done, total }) => {
			if (done % 25 === 0 || done === total) {
				console.log(`  stage${stage}: ${done}/${total}`);
			}
		},
	});

	console.log(`\n=== Stage 2 ランキング（${Date.now() - startedAt}ms） ===`);
	console.log('rank agent        role             reach  trans   Rs   depth networks');
	for (const [index, score] of result.stage2.entries()) {
		console.log(
			`${String(index + 1).padStart(4)} ${score.agentId} ${score.role.padEnd(16)} ` +
				`${score.attributableReach.toFixed(1).padStart(4)} ${score.transmissionCount.toFixed(1).padStart(6)} ` +
				`${score.individualRs.toFixed(2).padStart(5)} ${String(score.cascadeDepth).padStart(5)} ` +
				`${score.networksTraversed.join('+') || '-'}`,
		);
	}

	// 職種別の平均 Reach（どの職業が強いかの確認）
	const byRole = new Map<string, number[]>();
	for (const score of result.stage1) {
		const values = byRole.get(score.role) ?? [];
		values.push(score.transmissionCount);
		byRole.set(score.role, values);
	}
	console.log('\n=== Stage 1: 職種別の平均 伝播回数 ===');
	for (const [role, values] of [...byRole.entries()].sort()) {
		const average = values.reduce((sum, value) => sum + value, 0) / values.length;
		console.log(
			`  ${role.padEnd(16)} n=${String(values.length).padStart(3)} avg=${average.toFixed(2)}`,
		);
	}

	// Network 横断数別の平均 Reach（境界にいる Agent が強いかの確認）
	const bySpread = new Map<number, number[]>();
	for (const score of result.stage1) {
		const values = bySpread.get(score.crossNetworkSpread) ?? [];
		values.push(score.transmissionCount);
		bySpread.set(score.crossNetworkSpread, values);
	}
	console.log('\n=== Stage 1: Network 横断数別の平均 伝播回数 ===');
	for (const [spread, values] of [...bySpread.entries()].sort((a, b) => a[0] - b[0])) {
		const average = values.reduce((sum, value) => sum + value, 0) / values.length;
		console.log(
			`  networks=${spread} n=${String(values.length).padStart(3)} avg=${average.toFixed(2)}`,
		);
	}

	if (process.env.DATABASE_URL === undefined) {
		console.log('\n[super-spreader] DATABASE_URL 未設定のため保存をスキップしました');
		return;
	}

	// 保存は infrastructure を直接使わず composition 経由で解決する
	const { experimentRepository } = await import(
		'../src/backend/presentation/composition/simulation.composition'
	);
	const experimentId = await experimentRepository.create({
		name: `super-spreader (population ${population} / ${days} days)`,
		kind: 'super-spreader',
		config: { population, days, topN, stage2Seeds: STAGE2_SEEDS },
	});
	// ランキング 1 行を 1 結果として保存する。順位は配列の並びで保持される
	await experimentRepository.saveResults(
		experimentId,
		result.stage2.map((score) => ({
			label: score.agentId,
			runCount: score.runCount,
			cascadeProbability: score.cascadeProbability,
			averageRs: score.individualRs,
			// ランキングは Agent 単位の指標で平均と Peak を分けて持たないため、同じ値を入れる
			peakRs: score.individualRs,
			averageReach: score.attributableReach,
			totalSleepLossMinutes: score.totalSleepLossMinutes,
			standardDeviation: 0,
			// 画面が必要とする Role / Cascade Depth / Cross-network Spread はここへ入れる
			aggregate: score,
		})),
	);
	console.log(`\n[super-spreader] saved: experimentId=${experimentId}`);
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
