import type { AgentRole } from '../models/agent.model';
import type { MetricsSnapshot, RunSummary } from '../models/metrics.model';
import type { EventImpact, EventType } from '../models/simulation-event.model';
import type { SleepStateName } from '../models/sleep-state.model';

export interface AgentSnapshot {
	agentKey: string;
	role: AgentRole;
	homeId: string;
	workplaceId?: string;
	sleepNeedHours: number;
	responsibility: number;
	riskTolerance: number;
	cooperativeness: number;
	familyResponsibility: number;
	finalSleepDebtHours: number;
	finalFatigue: number;
	finalStress: number;
	finalSleepState: SleepStateName;
}

export interface RelationshipSnapshot {
	fromAgentKey: string;
	toAgentKey: string;
	kind: string;
}

export interface EventSnapshot {
	eventKey: string;
	tick: number;
	type: EventType;
	actorKey?: string;
	targetKeys: readonly string[];
	depth: number;
	impact: EventImpact;
}

export interface CausalEdgeSnapshot {
	fromEventKey: string;
	toEventKey: string;
	contribution: number;
}

export interface DecisionSnapshot {
	agentKey: string;
	tick: number;
	action: string;
	reason: string;
	model: string;
	context: unknown;
}

export interface RunPersistencePayload {
	experimentId?: string | null;
	seed: number;
	population: number;
	days: number;
	intervention: string | null;
	aiModel: string | null;
	config: unknown;
	summary: RunSummary;
	agents: readonly AgentSnapshot[];
	relationships: readonly RelationshipSnapshot[];
	events: readonly EventSnapshot[];
	causalEdges: readonly CausalEdgeSnapshot[];
	decisions: readonly DecisionSnapshot[];
	metrics: readonly MetricsSnapshot[];
}

export interface StoredRun {
	id: string;
	experimentId: string | null;
	seed: number;
	population: number;
	days: number;
	intervention: string | null;
	aiModel: string | null;
	status: string;
	/** Run 実行時の ExperimentConfig スナップショット。条件の違いを画面で示すために使う */
	config: unknown;
	summary: RunSummary | null;
}

/**
 * Run の永続化。Simulation Engine は Repository を呼ばず、
 * UseCase が Run 単位でまとめて保存する。書き込みはトランザクションで囲む。
 */
export interface SimulationRunRepository {
	save(payload: RunPersistencePayload): Promise<string>;
	findById(runId: string): Promise<StoredRun | null>;
	findByExperimentId(experimentId: string): Promise<StoredRun[]>;
	findRecent(limit: number): Promise<StoredRun[]>;
}
