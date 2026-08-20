import type { ExperimentAggregate } from '@/backend/presentation/composition/simulation.composition';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/frontend/components/ui/table';
import {
	formatDelta,
	formatPercent,
	toComparisonRows,
} from '@/frontend/lib/experiment-presentation';
import { formatInteger, formatNumber } from '@/frontend/lib/format';

interface ExperimentComparisonTableProps {
	results: readonly ExperimentAggregate[];
}

/**
 * 条件別の比較表。
 * 平均だけでは Seed 間のばらつきが読めないため、Cascade Reach は標準偏差を併記する（要件定義 28 章）。
 *
 * Cascade 発生率（24 章の判定）に加え、Rs の世代継続を問わない Outbreak 発生率と、
 * 収束が始まった世代を併記する。判定は成立しないが一度大きく広がる条件を取りこぼさないため。
 */
export function ExperimentComparisonTable({ results }: ExperimentComparisonTableProps) {
	if (results.length === 0) {
		return <p className="text-xs text-muted-foreground">この実験にはまだ集計結果がありません。</p>;
	}

	const rows = toComparisonRows(results);

	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>条件</TableHead>
						<TableHead className="text-right">Runs</TableHead>
						<TableHead className="text-right">Cascade 発生率</TableHead>
						<TableHead className="text-right">Outbreak 発生率</TableHead>
						<TableHead className="text-right">収束世代</TableHead>
						<TableHead className="text-right">平均 Reach ± SD</TableHead>
						<TableHead className="text-right">対照との差</TableHead>
						<TableHead className="text-right">平均 Rs</TableHead>
						<TableHead className="text-right">Peak Rs</TableHead>
						<TableHead className="text-right">平均 Sleep Loss</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow key={row.label}>
							<TableCell className="font-medium">{row.label}</TableCell>
							<TableCell className="text-right tabular-nums">{row.runCount}</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatPercent(row.cascadeProbability)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{row.outbreakProbability === null ? '-' : formatPercent(row.outbreakProbability)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{row.averageDampingGeneration === null
									? '-'
									: `G${formatNumber(row.averageDampingGeneration, 1)}`}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatNumber(row.averageReach, 1)} ± {formatNumber(row.standardDeviation, 1)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatDelta(row.reachDeltaVsControl)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatNumber(row.averageRs)}
							</TableCell>
							<TableCell className="text-right tabular-nums">{formatNumber(row.peakRs)}</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatInteger(row.totalSleepLossMinutes)} min
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
