import type { StoredExperiment } from '@/backend/presentation/composition/simulation.composition';
import { ExperimentComparisonTable } from '@/frontend/components/experiments/experiment-comparison-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import Link from 'next/link';

interface ExperimentListProps {
	experiments: readonly StoredExperiment[];
	databaseConfigured: boolean;
}

/** Experiment Dashboard 本体。実験ごとに条件比較を並べる */
export function ExperimentList({ experiments, databaseConfigured }: ExperimentListProps) {
	if (experiments.length === 0) {
		return (
			<Card>
				<CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
					<p>
						{databaseConfigured
							? '保存された実験がまだありません。'
							: 'DATABASE_URL が未設定のため、保存済みの実験を読み込めません。'}
					</p>
					<p className="text-xs">
						<code className="rounded bg-muted px-1 py-0.5">
							pnpm --filter webapp exec tsx scripts/run-experiment.ts --kind=shock-comparison
							--seeds=10
						</code>{' '}
						を実行すると、Batch Runner が実験結果をここへ保存します（DATABASE_URL が必要）。
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-4">
			{experiments.map((experiment) => (
				<Card key={experiment.id}>
					<CardHeader className="pb-2">
						<CardTitle className="flex flex-wrap items-baseline gap-2 text-sm">
							<Link href={`/experiments/${experiment.id}`} className="underline">
								{experiment.name}
							</Link>
							<span className="text-xs font-normal text-muted-foreground">{experiment.kind}</span>
						</CardTitle>
					</CardHeader>
					<CardContent className="p-4 pt-0 text-xs">
						<ExperimentComparisonTable results={experiment.results} />
					</CardContent>
				</Card>
			))}
		</div>
	);
}
