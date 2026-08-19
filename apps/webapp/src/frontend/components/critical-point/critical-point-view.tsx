import type { StoredExperiment } from '@/backend/presentation/composition/simulation.composition';
import { CriticalPointChart } from '@/frontend/components/critical-point/critical-point-chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/frontend/components/ui/table';
import {
	findCriticalPointRange,
	toCriticalPointSeries,
} from '@/frontend/lib/critical-point-presentation';
import { formatPercent } from '@/frontend/lib/experiment-presentation';
import { formatNumber } from '@/frontend/lib/format';

interface CriticalPointViewProps {
	experiment: StoredExperiment | null;
	databaseConfigured: boolean;
}

/** 初期睡眠不足率 Sweep の結果から臨界点候補を提示する */
export function CriticalPointView({ experiment, databaseConfigured }: CriticalPointViewProps) {
	if (experiment === null) {
		return (
			<Card>
				<CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
					<p>
						{databaseConfigured
							? 'critical-point の Sweep 結果がまだありません。'
							: 'DATABASE_URL が未設定のため、Sweep 結果を読み込めません。'}
					</p>
					<p className="text-xs">
						<code className="rounded bg-muted px-1 py-0.5">
							pnpm --filter webapp exec tsx scripts/run-experiment.ts --kind=critical-point
							--seeds=10
						</code>{' '}
						を実行すると、初期睡眠不足率 1〜20% の Sweep 結果がここへ保存されます。
					</p>
				</CardContent>
			</Card>
		);
	}

	const samples = toCriticalPointSeries(experiment.results);
	const range = findCriticalPointRange(samples);

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="flex flex-wrap items-baseline gap-2 text-sm">
						<span>Cascade Probability 曲線</span>
						<span className="text-xs font-normal text-muted-foreground">{experiment.name}</span>
					</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0">
					<CriticalPointChart samples={samples} />
					<p className="mt-2 text-xs text-muted-foreground">
						{range === null
							? '今回の Sweep 範囲では Cascade 発生率が 50% に達していません。臨界点は 20% より上にあるか、この条件では存在しません。'
							: range.lowerRate === null
								? `最小の初期率 ${formatPercent(range.upperRate)} で既に発生率が 50% を超えています。臨界点はこれより下にあります。`
								: `臨界点候補: 初期睡眠不足率 ${formatPercent(range.lowerRate)} 〜 ${formatPercent(range.upperRate)} の間。この区間で Cascade 発生率が 50% を跨ぎます。`}
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm">Sweep 結果</CardTitle>
				</CardHeader>
				<CardContent className="p-4 pt-0 text-xs">
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>初期睡眠不足率</TableHead>
									<TableHead className="text-right">Runs</TableHead>
									<TableHead className="text-right">Cascade 発生率</TableHead>
									<TableHead className="text-right">平均 Reach ± SD</TableHead>
									<TableHead className="text-right">平均 Rs</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{samples.map((sample) => (
									<TableRow key={sample.initialRate}>
										<TableCell className="font-medium tabular-nums">
											{formatPercent(sample.initialRate)}
										</TableCell>
										<TableCell className="text-right tabular-nums">{sample.runCount}</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatPercent(sample.cascadeProbability)}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatNumber(sample.averageReach, 1)} ±{' '}
											{formatNumber(sample.standardDeviation, 1)}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatNumber(sample.averageRs)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
