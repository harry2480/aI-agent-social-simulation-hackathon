import { RunSimulationUseCase } from '../../application/usecases/run-simulation.usecase';
import { PrismaAgentDecisionRepository } from '../../infrastructure/repositories/prisma-agent-decision.repository';
import { PrismaAgentRepository } from '../../infrastructure/repositories/prisma-agent.repository';
import { PrismaEventRepository } from '../../infrastructure/repositories/prisma-event.repository';
import { PrismaExperimentRepository } from '../../infrastructure/repositories/prisma-experiment.repository';
import { PrismaMetricsRepository } from '../../infrastructure/repositories/prisma-metrics.repository';
import { PrismaSimulationRunRepository } from '../../infrastructure/repositories/prisma-simulation-run.repository';
import {
	createDecideAgentActionUseCase,
	createRuleBasedDecisionGateway,
} from './decision.composition';

export const simulationRunRepository = new PrismaSimulationRunRepository();
export const experimentRepository = new PrismaExperimentRepository();
export const eventRepository = new PrismaEventRepository();
export const agentRepository = new PrismaAgentRepository();
export const agentDecisionRepository = new PrismaAgentDecisionRepository();
export const metricsRepository = new PrismaMetricsRepository();

/** Watch Mode 相当（AI Decision あり）の Run 実行 */
export function createRunSimulationUseCase(): RunSimulationUseCase {
	return new RunSimulationUseCase(createDecideAgentActionUseCase(), simulationRunRepository);
}

/** Experiment Mode（Rule-based 固定）の Run 実行 */
export function createExperimentRunSimulationUseCase(): RunSimulationUseCase {
	return new RunSimulationUseCase(createRuleBasedDecisionGateway(), simulationRunRepository);
}

/**
 * loaders / actions が必要とする型の再エクスポート。
 * `presentation/(loaders|actions)` は domain を直接参照できないため、
 * 全層を参照してよい composition を経由して型を渡す。
 */
export type { MetricsSnapshot, RunSummary } from '../../domain/models/metrics.model';
export type { ExperimentConfigParams } from '../../domain/models/experiment-config.model';
export { ExperimentConfig } from '../../domain/models/experiment-config.model';
export type {
	StoredExperiment,
	ExperimentAggregate,
} from '../../domain/repositories/experiment.repository';
export type {
	AgentSnapshot,
	CausalEdgeSnapshot,
	DecisionSnapshot,
	EventSnapshot,
	RelationshipSnapshot,
	StoredRun,
} from '../../domain/repositories/simulation-run.repository';
