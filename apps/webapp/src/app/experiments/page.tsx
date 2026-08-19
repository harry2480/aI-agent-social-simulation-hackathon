import {
	isDatabaseConfigured,
	loadRecentExperiments,
} from '@/backend/presentation/loaders/experiment.loader';
import { ExperimentList } from '@/frontend/components/experiments/experiment-list';
import Link from 'next/link';

/** DB の内容は Batch Runner の実行で変わるため、ビルド時に固定しない */
export const dynamic = 'force-dynamic';

export const metadata = {
	title: 'Experiment Dashboard | SLEEP CITY 2.0',
};

/** Batch Runner が保存した実験を新しい順に表示する。実行自体はスクリプト側の責務 */
export default async function ExperimentsPage() {
	const experiments = await loadRecentExperiments();

	return (
		<main className="mx-auto w-full max-w-6xl space-y-4 p-6">
			<header className="flex flex-wrap items-baseline justify-between gap-2">
				<h1 className="text-lg font-semibold">Experiment Dashboard</h1>
				<div className="flex gap-3 text-xs">
					<Link href="/critical-point" className="underline">
						Critical Point Explorer
					</Link>
					<Link href="/super-spreader" className="underline">
						Super-spreader Explorer
					</Link>
					<Link href="/" className="underline">
						← Simulation へ戻る
					</Link>
				</div>
			</header>
			<p className="text-xs text-muted-foreground">
				条件ごとの平均と標準偏差を併記しています。比較実験では Experimental Variable
				以外（Population・Agent 属性・City 構造・Seed 群）を固定しています。
			</p>
			<ExperimentList experiments={experiments} databaseConfigured={isDatabaseConfigured()} />
		</main>
	);
}
