import { RunSimulationUseCase } from '../../application/usecases/run-simulation.usecase';
import { PrismaAgentDecisionRepository } from '../../infrastructure/repositories/prisma-agent-decision.repository';
import { PrismaAgentRepository } from '../../infrastructure/repositories/prisma-agent.repository';
import { PrismaEventRepository } from '../../infrastructure/repositories/prisma-event.repository';
import { PrismaExperimentRepository } from '../../infrastructure/repositories/prisma-experiment.repository';
import { PrismaMetricsRepository } from '../../infrastructure/repositories/prisma-metrics.repository';
import { PrismaSimulationRunRepository } from '../../infrastructure/repositories/prisma-simulation-run.repository';
import {
	createDecideAgentActionUseCaseForModel,
	createRuleBasedDecisionGateway,
} from './decision.composition';

/**
 * DB が未設定の環境（DATABASE_URL 無しのローカル開発）かどうか。
 * Prisma は接続時に例外を投げるため、読み取り前にここで判定して画面を 500 にしない。
 */
export function isDatabaseConfigured(): boolean {
	const url = process.env.DATABASE_URL;
	return url !== undefined && url.length > 0;
}

export const simulationRunRepository = new PrismaSimulationRunRepository();
export const experimentRepository = new PrismaExperimentRepository();
export const eventRepository = new PrismaEventRepository();
export const agentRepository = new PrismaAgentRepository();
export const agentDecisionRepository = new PrismaAgentDecisionRepository();
export const metricsRepository = new PrismaMetricsRepository();

/** Experiment Mode（Rule-based 固定）の Run 実行 */
export function createExperimentRunSimulationUseCase(): RunSimulationUseCase {
	return new RunSimulationUseCase(createRuleBasedDecisionGateway(), simulationRunRepository);
}

/** AI Model 比較用。モデルごとに Gateway を差し替えて Run を実行する */
export function createModelComparisonRunSimulationUseCase(model: string): RunSimulationUseCase {
	return new RunSimulationUseCase(
		createDecideAgentActionUseCaseForModel(model),
		simulationRunRepository,
	);
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
export type { ExperimentKind } from '../../domain/models/experiment-kind.model';
export { EXPERIMENT_KINDS, isExperimentKind } from '../../domain/models/experiment-kind.model';
export type {
	AgentSnapshot,
	CausalEdgeSnapshot,
	DecisionSnapshot,
	EventSnapshot,
	RelationshipSnapshot,
	StoredRun,
} from '../../domain/repositories/simulation-run.repository';
