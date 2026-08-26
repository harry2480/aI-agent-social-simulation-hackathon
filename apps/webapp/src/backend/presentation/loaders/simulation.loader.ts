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
	isDatabaseConfigured,
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
	if (!isDatabaseConfigured()) {
		return [];
	}
	return simulationRunRepository.findRecent(limit);
}

/**
 * Replay 用に Run のメタ情報だけを読む。
 * 再実行に必要なのは Config スナップショットだけなので、Agent / Event までは読まない。
 */
export async function loadRunForReplay(runId: string): Promise<StoredRun | null> {
	if (!isDatabaseConfigured()) {
		return null;
	}
	return simulationRunRepository.findById(runId);
}

/**
 * 保存済み Run の詳細を読む。Decision は直近 200 件までに絞る
 * （1 Run で Population × Days のオーダーになり、全件読むと画面が持たないため）。
 *
 * Watch Mode は実行中の State を直接見るため画面からは使わない。
 * `GET /api/simulations/:id?detail=full` からの読み取り経路として使う。
 */
export async function loadRunDetail(runId: string): Promise<RunDetail | null> {
	if (!isDatabaseConfigured()) {
		return null;
	}
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
