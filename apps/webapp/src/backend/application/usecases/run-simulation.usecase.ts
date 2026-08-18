import type { AiDecisionGateway } from '../../domain/gateways/ai-decision.gateway';
import type { ExperimentConfig } from '../../domain/models/experiment-config.model';
import type { RunSummary } from '../../domain/models/metrics.model';
import type { SimulationState } from '../../domain/models/simulation-state.model';
import type {
	RunPersistencePayload,
	SimulationRunRepository,
} from '../../domain/repositories/simulation-run.repository';
import { SimulationEngine } from '../../domain/services/simulation-engine.service';

export interface RunSimulationResult {
	runId: string | null;
	summary: RunSummary;
	state: SimulationState;
}

/**
 * 単一 Run を実行し、結果を永続化する。
 * Repository を呼ぶのは UseCase であり、Simulation Engine ではない。
 */
export class RunSimulationUseCase {
	constructor(
		private readonly aiDecisionGateway: AiDecisionGateway,
		private readonly simulationRunRepository: SimulationRunRepository | null,
	) {}

	async execute(params: {
		config: ExperimentConfig;
		experimentId?: string | null;
		persist?: boolean;
		onTick?: (state: SimulationState) => void | Promise<void>;
	}): Promise<RunSimulationResult> {
		const engine = SimulationEngine.create(params.config, this.aiDecisionGateway);
		const state = engine.initialize();
		const summary = await engine.run(state, params.onTick);

		if (params.persist !== true || this.simulationRunRepository === null) {
			return { runId: null, summary, state };
		}

		const runId = await this.simulationRunRepository.save(
			buildRunPersistencePayload(state, summary, params.experimentId ?? null),
		);
		return { runId, summary, state };
	}
}

/**
 * Run の結果を永続化ペイロードへ変換する。
 * Watch Mode（ブラウザ実行）の保存でも同じ変換を使うため、UseCase の外へ切り出している。
 */
export function buildRunPersistencePayload(
	state: SimulationState,
	summary: RunSummary,
	experimentId: string | null,
): RunPersistencePayload {
	const config = state.config;
	const thresholds = config.sleepStateThresholds;

	return {
		experimentId,
		seed: config.seed,
		population: config.population,
		days: config.days,
		intervention: config.intervention,
		aiModel: config.aiModel,
		config: {
			seed: config.seed,
			population: config.population,
			days: config.days,
			initialSleepDeprivedRate: config.initialSleepDeprivedRate,
			initialSleepDebtHours: config.initialSleepDebtHours,
			shockTarget: config.shockTarget,
			trafficLevel: config.trafficLevel,
			intervention: config.intervention,
			aiModel: config.aiModel,
			sleepStateThresholds: thresholds,
			cascadeThresholds: config.cascadeThresholds,
			aiDecisionEnabled: config.aiDecisionEnabled,
		},
		summary,
		agents: state.orderedAgents().map((agent) => ({
			agentKey: agent.id,
			role: agent.role,
			homeId: agent.homeId,
			workplaceId: agent.workplaceId,
			sleepNeedHours: agent.sleepNeedHours,
			responsibility: agent.responsibility,
			riskTolerance: agent.riskTolerance,
			cooperativeness: agent.cooperativeness,
			familyResponsibility: agent.familyResponsibility,
			finalSleepDebtHours: agent.sleepDebtHours,
			finalFatigue: agent.fatigue,
			finalStress: agent.stress,
			finalSleepState: agent.sleepState(thresholds),
		})),
		relationships: state.relationships.map((relationship) => ({
			fromAgentKey: relationship.fromAgentId,
			toAgentKey: relationship.toAgentId,
			kind: relationship.kind,
		})),
		// 重要 Event のみを保存する。全 Tick ログは保存しない
		events: state.events
			.filter((event) => event.isSignificant)
			.map((event) => ({
				eventKey: event.id,
				tick: event.tick,
				type: event.type,
				actorKey: event.actorId,
				targetKeys: event.targetIds,
				depth: event.depth,
				impact: event.impact,
			})),
		causalEdges: state.causalEdges.map((edge) => ({
			fromEventKey: edge.fromEventId,
			toEventKey: edge.toEventId,
			contribution: edge.contribution,
		})),
		decisions: state
			.orderedAgents()
			.filter((agent) => agent.lastDecision !== undefined)
			.map((agent) => {
				const decision = agent.lastDecision;
				if (decision === undefined) {
					throw new Error('RunSimulationUseCase: decision unexpectedly missing');
				}
				return {
					agentKey: agent.id,
					tick: decision.tick,
					action: decision.action,
					reason: decision.reason,
					model: decision.model,
					context: { role: agent.role, fatigue: agent.fatigue },
				};
			}),
		metrics: state.metricsHistory,
	};
}
