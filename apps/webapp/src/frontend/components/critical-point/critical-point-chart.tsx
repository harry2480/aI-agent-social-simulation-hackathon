'use client';

import type { CriticalPointSample } from '@/frontend/lib/critical-point-presentation';
import {
	CRITICAL_CASCADE_PROBABILITY,
	toCriticalPointChartData,
} from '@/frontend/lib/critical-point-presentation';
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';

interface CriticalPointChartProps {
	samples: readonly CriticalPointSample[];
}

/**
 * 初期睡眠不足率に対する Cascade Probability 曲線（要件定義 30 章）。
 * 50% の基準線を引き、曲線がそれを跨ぐ区間を臨界点候補として読めるようにする。
 */
export function CriticalPointChart({ samples }: CriticalPointChartProps) {
	if (samples.length === 0) {
		return <p className="text-xs text-muted-foreground">Sweep 結果がありません。</p>;
	}

	const data = toCriticalPointChartData(samples);

	return (
		<div className="h-72 w-full">
			<ResponsiveContainer width="100%" height="100%">
				<LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
					<CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
					<XAxis
						dataKey="rate"
						tick={{ fontSize: 10 }}
						stroke="var(--color-muted-foreground)"
						label={{ value: '初期睡眠不足率 (%)', position: 'insideBottom', fontSize: 10, dy: 10 }}
					/>
					<YAxis
						yAxisId="probability"
						domain={[0, 100]}
						tick={{ fontSize: 10 }}
						stroke="var(--color-muted-foreground)"
					/>
					<YAxis
						yAxisId="reach"
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
					<ReferenceLine
						yAxisId="probability"
						y={CRITICAL_CASCADE_PROBABILITY * 100}
						stroke="var(--color-alert)"
						strokeDasharray="4 2"
						label={{ value: '50%', fontSize: 10, fill: 'var(--color-alert)' }}
					/>
					<Line
						yAxisId="probability"
						type="monotone"
						dataKey="probability"
						name="Cascade 発生率 (%)"
						stroke="var(--color-sleep-deprived)"
						dot
					/>
					<Line
						yAxisId="reach"
						type="monotone"
						dataKey="reach"
						name="平均 Cascade Reach"
						stroke="var(--color-primary)"
						strokeDasharray="4 2"
						dot={false}
					/>
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
