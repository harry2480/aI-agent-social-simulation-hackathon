import type { StoredRun } from '@/backend/presentation/composition/simulation.composition';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/frontend/components/ui/table';
import { describeRunCondition } from '@/frontend/lib/experiment-presentation';
import { formatInteger, formatNumber } from '@/frontend/lib/format';
import Link from 'next/link';

interface RunTableProps {
	experimentId: string;
	runs: readonly StoredRun[];
	selectedRunId: string | null;
}

/** 実験に紐づく Run 一覧。行を選ぶと時系列グラフの対象が切り替わる */
export function RunTable({ experimentId, runs, selectedRunId }: RunTableProps) {
	if (runs.length === 0) {
		return (
			<p className="text-xs text-muted-foreground">
				この実験には Run が保存されていません。Batch Runner を実行すると Seed ごとの Run
				が保存されます。
			</p>
		);
	}

	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>条件</TableHead>
						<TableHead className="text-right">Seed</TableHead>
						<TableHead className="text-right">Reach</TableHead>
						<TableHead className="text-right">Peak Rs</TableHead>
						<TableHead className="text-right">Accident</TableHead>
						<TableHead className="text-right">Overtime</TableHead>
						<TableHead className="text-right">Sleep Loss</TableHead>
						<TableHead>AI Model</TableHead>
						<TableHead>Replay</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{runs.map((run) => {
						const isSelected = run.id === selectedRunId;
						return (
							<TableRow key={run.id} className={isSelected ? 'bg-muted' : undefined}>
								<TableCell className="font-medium">
									<Link
										href={`/experiments/${experimentId}?run=${run.id}`}
										className="underline"
										aria-current={isSelected ? 'true' : undefined}
									>
										{describeRunCondition(run.config)}
									</Link>
								</TableCell>
								<TableCell className="text-right tabular-nums">{run.seed}</TableCell>
								<TableCell className="text-right tabular-nums">
									{run.summary === null ? '-' : formatInteger(run.summary.cascadeReach)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{run.summary === null ? '-' : formatNumber(run.summary.peakRs)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{run.summary === null ? '-' : formatInteger(run.summary.accidentCount)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{run.summary === null ? '-' : formatNumber(run.summary.overtimeHours, 1)} h
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{run.summary === null ? '-' : formatInteger(run.summary.totalSleepLossMinutes)}{' '}
									min
								</TableCell>
								<TableCell>{run.aiModel ?? 'rule-based'}</TableCell>
								<TableCell>
									{/* 同一 Seed・同一 Config で再実行し、City Map 上で観察する */}
									<Link href={`/?replay=${run.id}`} className="underline">
										再生
									</Link>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}
