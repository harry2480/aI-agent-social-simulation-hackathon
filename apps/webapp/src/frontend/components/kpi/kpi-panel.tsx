'use client';

import type { MetricsSnapshot } from '@/backend/presentation/composition/watch-mode-engine.composition';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { formatInteger, formatMinutesAsHours, formatNumber } from '@/frontend/lib/format';

interface KpiPanelProps {
	metrics: MetricsSnapshot | null;
	population: number;
}

/** Rs は疫学上の R0 ではないことを常設で明示する（要件定義 23 章） */
const RS_DISCLAIMER = 'Rs は SLEEP CITY 独自指標であり、感染症疫学の R0 とは異なります。';

export function KpiPanel({ metrics, population }: KpiPanelProps) {
	const items: { label: string; value: string; hint?: string }[] = [
		{ label: 'Current Rs', value: metrics === null ? '-' : formatNumber(metrics.currentRs) },
		{
			label: 'Sleep-Deprived',
			value:
				metrics === null
					? '-'
					: `${formatInteger(metrics.sleepDeprivedPopulation)} / ${formatInteger(population)}`,
		},
		{
			label: 'Severe',
			value: metrics === null ? '-' : formatInteger(metrics.severeSleepDeprivedPopulation),
		},
		{
			label: 'Total Sleep Debt',
			value: metrics === null ? '-' : `${formatNumber(metrics.totalSleepDebtHours, 1)} h`,
		},
		{
			label: 'Total Sleep Loss',
			value: metrics === null ? '-' : formatMinutesAsHours(metrics.totalSleepLossMinutes),
		},
		{ label: 'Cascade Reach', value: metrics === null ? '-' : formatInteger(metrics.cascadeReach) },
		{ label: 'Cascade Depth', value: metrics === null ? '-' : formatInteger(metrics.cascadeDepth) },
		{
			label: 'Generation',
			value: metrics === null ? '-' : formatInteger(metrics.cascadeGeneration),
		},
		{ label: 'Accidents', value: metrics === null ? '-' : formatInteger(metrics.accidentCount) },
		{
			label: 'Overtime',
			value: metrics === null ? '-' : `${formatNumber(metrics.overtimeHours, 1)} h`,
		},
		{
			label: 'Avg Commute Delay',
			value: metrics === null ? '-' : `${formatNumber(metrics.averageCommuteDelayMinutes, 1)} min`,
		},
	];

	return (
		<Card className="flex min-h-0 flex-col">
			<CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
				<dl className="grid grid-cols-2 gap-3">
					{items.map((item) => (
						<div key={item.label} className="space-y-0.5">
							<dt className="text-xs text-muted-foreground">{item.label}</dt>
							<dd className="font-mono text-lg tabular-nums text-foreground">{item.value}</dd>
						</div>
					))}
				</dl>
				<p className="text-xs text-muted-foreground">{RS_DISCLAIMER}</p>
			</CardContent>
		</Card>
	);
}
