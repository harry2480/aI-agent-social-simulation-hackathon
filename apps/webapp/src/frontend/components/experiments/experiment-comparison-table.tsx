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

/** これらの指標を集計へ加える前に保存された実験では読めないため、値の無い列は - にする */
function formatOptional(value: number | null, unit?: string): string {
	if (value === null) {
		return '-';
	}
	return unit === undefined ? formatNumber(value, 1) : `${formatNumber(value, 1)} ${unit}`;
}

/**
 * 条件別の比較表。
 * 平均だけでは Seed 間のばらつきが読めないため、Cascade Reach は標準偏差を併記する（要件定義 28 章）。
 *
 * Cascade 発生率（24 章の判定）に加え、Rs の世代継続を問わない Outbreak 発生率と、
 * 収束が始まった世代を併記する。判定は成立しないが一度大きく広がる条件を取りこぼさないため。
 *
 * Sleep Debt / Depth / 事故 / 残業 / 通勤遅延まで並べるのは、介入の副作用を読むため（32 章）。
 * 伝播が減っても事故や残業が増えているなら、その介入は成功とは言えない。
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
						<TableHead className="text-right">平均 Sleep Debt</TableHead>
						<TableHead className="text-right">平均 Depth</TableHead>
						<TableHead className="text-right">平均 事故</TableHead>
						<TableHead className="text-right">平均 残業</TableHead>
						<TableHead className="text-right">平均 通勤遅延</TableHead>
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
							<TableCell className="text-right tabular-nums">
								{formatOptional(row.averageSleepDebtHours, 'h')}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatOptional(row.averageCascadeDepth)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatOptional(row.averageAccidentCount)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatOptional(row.averageOvertimeHours, 'h')}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatOptional(row.averageCommuteDelayMinutes, 'min')}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
