import {
	isDatabaseConfigured,
	loadRecentExperiments,
} from '@/backend/presentation/loaders/experiment.loader';
import { SuperSpreaderRanking } from '@/frontend/components/super-spreader/super-spreader-ranking';
import { findExperimentOfKind } from '@/frontend/lib/experiment-presentation';
import Link from 'next/link';

/** DB の内容は探索スクリプトの実行で変わるため、ビルド時に固定しない */
export const dynamic = 'force-dynamic';

export const metadata = {
	title: 'Sleep Super-spreader Explorer | SLEEP CITY 2.0',
};

export default async function SuperSpreaderPage() {
	const experiments = await loadRecentExperiments();
	const experiment = findExperimentOfKind(experiments, 'super-spreader');

	return (
		<main className="mx-auto w-full max-w-6xl space-y-4 p-6">
			<header className="flex flex-wrap items-baseline justify-between gap-2">
				<h1 className="text-lg font-semibold">Sleep Super-spreader Explorer</h1>
				<div className="flex gap-3 text-xs">
					<Link href="/experiments" className="underline">
						Experiment Dashboard
					</Link>
					<Link href="/" className="underline">
						← Simulation へ戻る
					</Link>
				</div>
			</header>
			<p className="text-xs text-muted-foreground">
				Stage 1 で全 Agent を Patient Zero 候補として高速評価し、上位 Agent のみ複数 Seed
				で再評価した Stage 2 の結果です。帰属 Reach はその Agent
				を起点に伝播グラフを辿った新規ケース数で、Run 全体の Cascade Reach とは異なります。
			</p>
			<SuperSpreaderRanking experiment={experiment} databaseConfigured={isDatabaseConfigured()} />
		</main>
	);
}
