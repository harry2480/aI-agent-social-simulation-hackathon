import type { StoredExperiment } from '@/backend/presentation/composition/simulation.composition';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/frontend/components/ui/table';
import { formatPercent } from '@/frontend/lib/experiment-presentation';
import { formatInteger, formatNumber, formatRoleLabel } from '@/frontend/lib/format';
import { toSuperSpreaderRanking } from '@/frontend/lib/super-spreader-presentation';

interface SuperSpreaderRankingProps {
	experiment: StoredExperiment | null;
	databaseConfigured: boolean;
}

/** Stage 2 のランキング表示（要件定義 31 章） */
export function SuperSpreaderRanking({
	experiment,
	databaseConfigured,
}: SuperSpreaderRankingProps) {
	if (experiment === null) {
		return (
			<Card>
				<CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
					<p>
						{databaseConfigured
							? 'Super-spreader の探索結果がまだありません。'
							: 'DATABASE_URL が未設定のため、探索結果を読み込めません。'}
					</p>
					<p className="text-xs">
						<code className="rounded bg-muted px-1 py-0.5">
							pnpm --filter webapp exec tsx scripts/explore-super-spreader.ts --population=300
							--days=7 --top=10
						</code>{' '}
						を実行すると、2 段階探索のランキングがここへ保存されます。
					</p>
				</CardContent>
			</Card>
		);
	}

	const rows = toSuperSpreaderRanking(experiment.results);

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="flex flex-wrap items-baseline gap-2 text-sm">
					<span>Stage 2 ランキング</span>
					<span className="text-xs font-normal text-muted-foreground">{experiment.name}</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="p-4 pt-0 text-xs">
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="text-right">#</TableHead>
								<TableHead>Agent</TableHead>
								<TableHead>Role</TableHead>
								<TableHead className="text-right">帰属 Reach</TableHead>
								<TableHead className="text-right">伝播回数</TableHead>
								<TableHead className="text-right">Cascade 発生率</TableHead>
								<TableHead className="text-right">Individual Rs</TableHead>
								<TableHead className="text-right">Cascade Depth</TableHead>
								<TableHead className="text-right">Sleep Loss</TableHead>
								<TableHead>Network 横断</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.agentId}>
									<TableCell className="text-right tabular-nums">{row.rank}</TableCell>
									<TableCell className="font-medium">{row.agentId}</TableCell>
									<TableCell>{formatRoleLabel(row.role)}</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatNumber(row.attributableReach, 1)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatNumber(row.transmissionCount, 1)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatPercent(row.cascadeProbability)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatNumber(row.individualRs)}
									</TableCell>
									<TableCell className="text-right tabular-nums">{row.cascadeDepth}</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatInteger(row.totalSleepLossMinutes)} min
									</TableCell>
									<TableCell>
										{row.networksTraversed.length === 0
											? `${row.crossNetworkSpread}`
											: `${row.crossNetworkSpread}（${row.networksTraversed.join(' + ')}）`}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}
