'use client';

import type { MetricsSnapshot } from '@/backend/presentation/composition/simulation.composition';
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';

interface RunMetricsChartProps {
	metrics: readonly MetricsSnapshot[];
}

/** 1 日 = 96 Tick（15 分 Tick） */
const TICKS_PER_DAY = 96;

/**
 * Run の KPI 時系列（要件定義 25・36 章）。
 * Sleep-Deprived Population と Rs はスケールが 2 桁以上違うため軸を分ける。
 */
export function RunMetricsChart({ metrics }: RunMetricsChartProps) {
	if (metrics.length === 0) {
		return (
			<p className="text-xs text-muted-foreground">この Run には Metrics が保存されていません。</p>
		);
	}

	const data = metrics.map((snapshot) => ({
		day: Number((snapshot.tick / TICKS_PER_DAY + 1).toFixed(2)),
		sleepDeprived: snapshot.sleepDeprivedPopulation,
		severe: snapshot.severeSleepDeprivedPopulation,
		accidents: snapshot.accidentCount,
		rs: Number(snapshot.currentRs.toFixed(3)),
		sleepDebt: Number(snapshot.totalSleepDebtHours.toFixed(1)),
	}));

	return (
		<div className="h-72 w-full">
			<ResponsiveContainer width="100%" height="100%">
				<LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
					<CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
					<XAxis
						dataKey="day"
						tick={{ fontSize: 10 }}
						stroke="var(--color-muted-foreground)"
						label={{ value: 'Day', position: 'insideBottomRight', fontSize: 10 }}
					/>
					<YAxis yAxisId="count" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
					<YAxis
						yAxisId="rate"
						orientation="right"
						tick={{ fontSize: 10 }}
						stroke="var(--color-muted-foreground)"
					/>
					<Tooltip
						contentStyle={{
							background: 'var(--color-card)',
							border: '1px solid var(--color-border)',
							fontSize: 11,
						}}
					/>
					<Legend wrapperStyle={{ fontSize: 11 }} />
					<Line
						yAxisId="count"
						type="monotone"
						dataKey="sleepDeprived"
						name="Sleep Deprived"
						stroke="var(--color-sleep-deprived)"
						dot={false}
					/>
					<Line
						yAxisId="count"
						type="monotone"
						dataKey="severe"
						name="Severe"
						stroke="var(--color-sleep-severe)"
						dot={false}
					/>
					<Line
						yAxisId="count"
						type="monotone"
						dataKey="accidents"
						name="Accident Count"
						stroke="var(--color-alert)"
						dot={false}
					/>
					<Line
						yAxisId="rate"
						type="monotone"
						dataKey="rs"
						name="Rs"
						stroke="var(--color-primary)"
						dot={false}
						strokeDasharray="4 2"
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
