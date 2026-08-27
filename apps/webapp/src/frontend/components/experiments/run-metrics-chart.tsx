'use client';

import type { MetricsSnapshot } from '@/backend/presentation/composition/simulation.composition';
import { toRunMetricsSeries } from '@/frontend/lib/run-metrics-presentation';
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

/**
 * Run の KPI 時系列（要件定義 25・39 章）。
 *
 * 人数・Rs・Sleep Debt はスケールが 2 桁以上違うため軸を分ける。
 * Sleep Debt は Population ぶんの合計で人数の 10 倍まで伸びるため、
 * 人数と同じ軸に載せると人数の変化が潰れて読めない。
 */
export function RunMetricsChart({ metrics }: RunMetricsChartProps) {
	if (metrics.length === 0) {
		return (
			<p className="text-xs text-muted-foreground">この Run には Metrics が保存されていません。</p>
		);
	}

	const data = toRunMetricsSeries(metrics);

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
					<YAxis
						yAxisId="debt"
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
					<Line
						yAxisId="debt"
						type="monotone"
						dataKey="sleepDebt"
						name="Sleep Debt (h)"
						stroke="var(--color-sleep-tired)"
						dot={false}
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
