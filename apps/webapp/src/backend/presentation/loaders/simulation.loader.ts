import 'server-only';
import {
	type AgentSnapshot,
	type CausalEdgeSnapshot,
	type DecisionSnapshot,
	type EventSnapshot,
	type MetricsSnapshot,
	type StoredRun,
	agentDecisionRepository,
	agentRepository,
	eventRepository,
	metricsRepository,
	simulationRunRepository,
} from '../composition/simulation.composition';

export interface RunDetail {
	run: StoredRun;
	agents: AgentSnapshot[];
	events: EventSnapshot[];
	causalEdges: CausalEdgeSnapshot[];
	decisions: DecisionSnapshot[];
	metrics: MetricsSnapshot[];
}

export async function loadRecentRuns(limit = 20): Promise<StoredRun[]> {
	return simulationRunRepository.findRecent(limit);
}

export async function loadRunDetail(runId: string): Promise<RunDetail | null> {
	const run = await simulationRunRepository.findById(runId);
	if (run === null) {
		return null;
	}

	const [agents, events, causalEdges, decisions, metrics] = await Promise.all([
		agentRepository.findByRunId(runId),
		eventRepository.findByRunId(runId),
		eventRepository.findCausalEdgesByRunId(runId),
		agentDecisionRepository.findByRunId(runId, 200),
		metricsRepository.findByRunId(runId),
	]);

	return { run, agents, events, causalEdges, decisions, metrics };
}
