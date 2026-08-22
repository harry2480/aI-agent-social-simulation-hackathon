'use client';

import type {
	Agent,
	SimulationState,
	SleepStateName,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import {
	agentDetailRows,
	formatAgentIdList,
	transmissionsOf,
} from '@/frontend/lib/agent-detail-presentation';
import { eventOriginPresentation } from '@/frontend/lib/event-origin-presentation';
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
	const aiOrigin = eventOriginPresentation('ai_decision');
	const { parentIds, childIds } = transmissionsOf(state?.transmissions ?? [], agent.id);
	const rows = agentDetailRows(agent, state?.generations.get(agent.id));

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
					<p className="text-muted-foreground">
						<span className={aiOrigin.textClass}>{aiOrigin.marker}</span> Last AI Decision
						<span className="ml-1">（{aiOrigin.description}。事故の発生自体は確率抽選）</span>
					</p>
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
						<p className="text-foreground">{formatAgentIdList(parentIds)}</p>
					</div>
					<div>
						<p className="text-muted-foreground">Child Transmissions</p>
						<p className="text-foreground">{formatAgentIdList(childIds)}</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
