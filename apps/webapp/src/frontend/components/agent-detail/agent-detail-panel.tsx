'use client';

import type {
	Agent,
	SimulationState,
	SleepStateName,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { formatNumber, formatRoleLabel } from '@/frontend/lib/format';
import { sleepStatePresentation } from '@/frontend/lib/sleep-state-presentation';

interface AgentDetailPanelProps {
	agent: Agent | null;
	sleepState: SleepStateName | null;
	state: SimulationState | null;
}

export function AgentDetailPanel({ agent, sleepState, state }: AgentDetailPanelProps) {
	if (agent === null || sleepState === null) {
		return (
			<Card className="flex min-h-0 flex-col">
				<CardHeader className="pb-2">
					<CardTitle className="text-sm">Agent Detail</CardTitle>
				</CardHeader>
				<CardContent className="p-4 text-xs text-muted-foreground">
					City Map か Timeline から Agent を選択してください。
				</CardContent>
			</Card>
		);
	}

	const presentation = sleepStatePresentation(sleepState);
	const parentTransmissions =
		state?.transmissions.filter((transmission) => transmission.toAgentId === agent.id) ?? [];
	const childTransmissions =
		state?.transmissions.filter((transmission) => transmission.fromAgentId === agent.id) ?? [];

	const rows: { label: string; value: string }[] = [
		{ label: 'Role', value: formatRoleLabel(agent.role) },
		{ label: 'Current Location', value: agent.currentLocationId },
		{ label: 'Current Action', value: agent.currentAction },
		{ label: 'Sleep Need', value: `${formatNumber(agent.sleepNeedHours, 1)} h` },
		{ label: 'Sleep Debt', value: `${formatNumber(agent.sleepDebtHours, 2)} h` },
		{ label: 'Fatigue', value: formatNumber(agent.fatigue, 0) },
		{ label: 'Stress', value: formatNumber(agent.stress, 0) },
		{ label: 'Responsibility', value: formatNumber(agent.responsibility) },
		{ label: 'Risk Tolerance', value: formatNumber(agent.riskTolerance) },
		{ label: 'Cooperativeness', value: formatNumber(agent.cooperativeness) },
		{ label: 'Family Responsibility', value: formatNumber(agent.familyResponsibility) },
		{ label: 'Generation', value: String(state?.generations.get(agent.id) ?? '-') },
	];

	return (
		<Card className="flex min-h-0 flex-col">
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center gap-2 text-sm">
					<span aria-hidden className={presentation.textClass}>
						{presentation.marker}
					</span>
					<span>{agent.id}</span>
					<span className="text-xs font-normal text-muted-foreground">{presentation.label}</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="min-h-0 flex-1 space-y-3 overflow-auto p-4 pt-0 text-xs">
				<dl className="grid grid-cols-2 gap-2">
					{rows.map((row) => (
						<div key={row.label}>
							<dt className="text-muted-foreground">{row.label}</dt>
							<dd className="font-mono tabular-nums text-foreground">{row.value}</dd>
						</div>
					))}
				</dl>

				<div>
					<p className="text-muted-foreground">Last AI Decision</p>
					{agent.lastDecision === undefined ? (
						<p className="text-foreground">-</p>
					) : (
						<p className="text-foreground">
							<span className="font-medium">{agent.lastDecision.action}</span> ·{' '}
							{agent.lastDecision.reason}{' '}
							<span className="text-muted-foreground">({agent.lastDecision.model})</span>
						</p>
					)}
				</div>

				<div className="grid grid-cols-2 gap-2">
					<div>
						<p className="text-muted-foreground">Parent Transmission</p>
						<p className="text-foreground">
							{parentTransmissions.length === 0
								? '-'
								: parentTransmissions.map((transmission) => transmission.fromAgentId).join(', ')}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground">Child Transmissions</p>
						<p className="text-foreground">
							{childTransmissions.length === 0
								? '-'
								: childTransmissions.map((transmission) => transmission.toAgentId).join(', ')}
						</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
