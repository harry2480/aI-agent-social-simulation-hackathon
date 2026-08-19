import type {
	ExperimentAggregate,
	StoredRun,
} from '@/backend/presentation/composition/simulation.composition';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { buildExperimentReport } from '@/frontend/lib/experiment-report';

interface ExperimentReportCardProps {
	results: readonly ExperimentAggregate[];
	runs: readonly StoredRun[];
}

/** 保存された数値から決定論的に生成する分析レポート。AI には推論させない */
export function ExperimentReportCard({ results, runs }: ExperimentReportCardProps) {
	const report = buildExperimentReport({ results, runs });

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm">自動分析レポート</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3 p-4 pt-0 text-xs">
				<p className="text-foreground">{report.headline}</p>

				{report.findings.length === 0 ? null : (
					<div className="space-y-1">
						<p className="text-muted-foreground">読み取れたこと</p>
						<ul className="list-disc space-y-1 pl-4 text-foreground">
							{report.findings.map((finding) => (
								<li key={finding}>{finding}</li>
							))}
						</ul>
					</div>
				)}

				{report.cautions.length === 0 ? null : (
					<div className="space-y-1">
						<p className="text-muted-foreground">結論の前に確認すること</p>
						<ul className="list-disc space-y-1 pl-4 text-alert">
							{report.cautions.map((caution) => (
								<li key={caution}>{caution}</li>
							))}
						</ul>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
