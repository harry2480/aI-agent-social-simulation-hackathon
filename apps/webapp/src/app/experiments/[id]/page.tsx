import {
	isDatabaseConfigured,
	loadExperimentDetail,
	loadRunMetrics,
} from '@/backend/presentation/loaders/experiment.loader';
import { ExperimentComparisonTable } from '@/frontend/components/experiments/experiment-comparison-table';
import { ExperimentReportCard } from '@/frontend/components/experiments/experiment-report-card';
import { RunMetricsChart } from '@/frontend/components/experiments/run-metrics-chart';
import { RunTable } from '@/frontend/components/experiments/run-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { selectRun } from '@/frontend/lib/simulation-form';
import Link from 'next/link';
import { notFound } from 'next/navigation';

/** DB の内容は Batch Runner の実行で変わるため、ビルド時に固定しない */
export const dynamic = 'force-dynamic';

interface ExperimentDetailPageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ run?: string }>;
}

export default async function ExperimentDetailPage({
	params,
	searchParams,
}: ExperimentDetailPageProps) {
	const { id } = await params;
	const detail = await loadExperimentDetail(id);
	if (detail === null) {
		// DB 未設定は「実験が存在しない」ではないので 404 にせず、一覧と同じ案内へ送る
		if (!isDatabaseConfigured()) {
			return <DatabaseNotConfigured />;
		}
		notFound();
	}

	const { run: requestedRunId } = await searchParams;
	// 指定が無ければ先頭の Run を表示する。Run が無い実験では時系列は出せない
	const selectedRun = selectRun(detail.runs, requestedRunId);
	const metrics = selectedRun === null ? [] : await loadRunMetrics(selectedRun.id);

	return (
		<main className="mx-auto w-full max-w-6xl space-y-4 p-6">
			<header className="flex flex-wrap items-baseline justify-between gap-2">
				<h1 className="text-lg font-semibold">{detail.experiment.name}</h1>
				<Link href="/experiments" className="text-xs underline">
					← Experiment Dashboard へ戻る
				</Link>
			</header>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm">条件比較</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0 text-xs">
					<ExperimentComparisonTable results={detail.experiment.results} />
				</CardContent>
			</Card>

			<ExperimentReportCard
				results={detail.experiment.results}
				runs={detail.runs}
				kind={detail.experiment.kind}
				config={detail.experiment.config}
			/>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm">
						KPI 時系列
						{selectedRun === null ? null : (
							<span className="ml-2 text-xs font-normal text-muted-foreground">
								seed {selectedRun.seed}
							</span>
						)}
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					<RunMetricsChart metrics={metrics} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm">Run 一覧</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0 text-xs">
					<RunTable
						experimentId={detail.experiment.id}
						runs={detail.runs}
						selectedRunId={selectedRun?.id ?? null}
					/>
				</CardContent>
			</Card>
		</main>
	);
}

/** DATABASE_URL が無い環境向けの案内。実行方法は Experiment Dashboard に載せている */
function DatabaseNotConfigured() {
	return (
		<main className="mx-auto w-full max-w-6xl space-y-4 p-6">
			<h1 className="text-lg font-semibold">Experiment 詳細</h1>
			<Card>
				<CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
					<p>DATABASE_URL が未設定のため、実験を読み込めません。</p>
					<Link href="/experiments" className="text-xs underline">
						← Experiment Dashboard へ戻る
					</Link>
				</CardContent>
			</Card>
		</main>
	);
}
