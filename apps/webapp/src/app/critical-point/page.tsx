import {
	isDatabaseConfigured,
	loadRecentExperiments,
} from '@/backend/presentation/loaders/experiment.loader';
import { CriticalPointView } from '@/frontend/components/critical-point/critical-point-view';
import Link from 'next/link';

/** DB の内容は Batch Runner の実行で変わるため、ビルド時に固定しない */
export const dynamic = 'force-dynamic';

export const metadata = {
	title: 'Critical Point Explorer | SLEEP CITY 2.0',
};

export default async function CriticalPointPage() {
	const experiments = await loadRecentExperiments();
	// 最新の Sweep を対象にする。過去分は Experiment Dashboard から辿れる
	const experiment = experiments.find((candidate) => candidate.kind === 'critical-point') ?? null;

	return (
		<main className="mx-auto w-full max-w-6xl space-y-4 p-6">
			<header className="flex flex-wrap items-baseline justify-between gap-2">
				<h1 className="text-lg font-semibold">Critical Point Explorer</h1>
				<div className="flex gap-3 text-xs">
					<Link href="/experiments" className="underline">
						Experiment Dashboard
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
				初期睡眠不足率を 1% から 20% まで振り、Cascade
				が自己増殖し始める境界を探します。各点は同一条件・複数 Seed の平均です。
			</p>
			<CriticalPointView experiment={experiment} databaseConfigured={isDatabaseConfigured()} />
		</main>
	);
}
