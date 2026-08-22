'use client';

import type { MetricsSnapshot } from '@/backend/presentation/composition/watch-mode-engine.composition';
import { Card, CardContent } from '@/frontend/components/ui/card';
import { RS_DISCLAIMER, buildKpiRows } from '@/frontend/lib/kpi-presentation';

interface KpiPanelProps {
	metrics: MetricsSnapshot | null;
	population: number;
}

export function KpiPanel({ metrics, population }: KpiPanelProps) {
	const rows = buildKpiRows(metrics, population);

	return (
		<Card className="flex min-h-0 flex-col">
			<CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
				<dl className="grid grid-cols-2 gap-3">
					{rows.map((row) => (
						<div key={row.label} className="space-y-0.5">
							<dt className="text-xs text-muted-foreground">{row.label}</dt>
							<dd className="font-mono text-lg tabular-nums text-foreground">{row.value}</dd>
						</div>
					))}
				</dl>
				<p className="text-xs text-muted-foreground">{RS_DISCLAIMER}</p>
			</CardContent>
		</Card>
	);
}
