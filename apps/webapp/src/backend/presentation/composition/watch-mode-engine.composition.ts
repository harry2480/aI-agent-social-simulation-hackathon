import { buildRunPersistencePayload } from '../../application/usecases/run-simulation.usecase';
import type { AiDecisionGateway } from '../../domain/gateways/ai-decision.gateway';
import type { ExperimentConfig } from '../../domain/models/experiment-config.model';
import type { RunSummary as RunSummaryType } from '../../domain/models/metrics.model';
import type { SimulationState as SimulationStateType } from '../../domain/models/simulation-state.model';
import {
	CausalGraphService,
	type CausalSubgraph,
} from '../../domain/services/causal-graph.service';
import { SimulationEngine } from '../../domain/services/simulation-engine.service';
import { HttpAiDecisionGateway } from '../../infrastructure/adapters/http-ai-decision.adapter';
import { RuleBasedAiDecisionGateway } from '../../infrastructure/adapters/rule-based-ai-decision.adapter';

/**
 * Watch Mode 用の Composition Root。
 *
 * frontend は `.dependency-cruiser.cjs` の frontend-only-depend-on-presentation により
 * `backend/presentation/` 以外を import できない。クライアントで Simulation Engine を
 * 駆動するための露出口をこのファイル 1 本に限定することで、依存ルールを緩めずに
 * ブラウザ実行を成立させる。
 *
 * このファイルは Prisma・Node 専用モジュールを一切参照しない。
 * 参照するとクライアントバンドルへ流出するため、依存を追加する際は必ず確認すること。
 *
 * AI Decision は OPENROUTER_API_KEY をクライアントへ露出させないため、
 * 必ず Route Handler (`POST /api/agents/decision`) を経由する。
 */
export function createWatchModeEngine(
	config: ExperimentConfig,
	options: { aiDecisionEnabled: boolean },
): SimulationEngine {
	const gateway: AiDecisionGateway = options.aiDecisionEnabled
		? new HttpAiDecisionGateway()
		: new RuleBasedAiDecisionGateway();

	return SimulationEngine.create(config, gateway);
}

/**
 * Watch Mode UI が必要とする型の再エクスポート。
 * frontend は presentation 層のみ参照可能なため、domain の型はここを経由して渡す。
 */
export type { AgentRole, AgentActionName } from '../../domain/models/agent.model';
export type { Agent } from '../../domain/models/agent.model';
export type { City, Facility, District, Road } from '../../domain/models/city.model';
export type { MetricsSnapshot, RunSummary } from '../../domain/models/metrics.model';
export type { SleepStateName } from '../../domain/models/sleep-state.model';
export type {
	EventOrigin,
	EventType,
	SimulationEvent,
} from '../../domain/models/simulation-event.model';
export { originOfEventType } from '../../domain/models/simulation-event.model';
export type {
	SimulationState,
	SleepTransmission,
} from '../../domain/models/simulation-state.model';
export type { SleepStateThresholds } from '../../domain/models/sleep-state.model';
export type {
	CascadeThresholds,
	ExperimentConfigError,
	ExperimentConfigParams,
	InterventionName,
	ShockTarget,
} from '../../domain/models/experiment-config.model';
export {
	DEFAULT_CASCADE_THRESHOLDS,
	ExperimentConfig,
	MAX_DAYS,
	MAX_POPULATION,
} from '../../domain/models/experiment-config.model';
export { DEFAULT_SLEEP_STATE_THRESHOLDS } from '../../domain/models/sleep-state.model';
export { sleepStateFrom } from '../../domain/models/sleep-state.model';

/**
 * Watch Mode の実行結果を保存用ペイロードへ変換する。
 * クライアントは domain を直接参照できないため、この composition を経由して変換する。
 * サーバー側の Run 実行と同じ変換関数を使うので、保存内容が経路によってずれない。
 */
export function buildWatchRunPayload(state: SimulationStateType, summary: RunSummaryType) {
	const payload = buildRunPersistencePayload(state, summary, null);
	return {
		config: payload.config,
		seed: payload.seed,
		population: payload.population,
		days: payload.days,
		intervention: payload.intervention,
		aiModel: payload.aiModel,
		summary: payload.summary,
		agents: [...payload.agents],
		relationships: [...payload.relationships],
		events: [...payload.events],
		causalEdges: [...payload.causalEdges],
		decisions: [...payload.decisions],
		metrics: [...payload.metrics],
	};
}

/**
 * Causal Graph の部分グラフを組み立てる。
 * クライアントは domain を直接参照できないため、この composition を経由する。
 */
export function buildCausalSubgraph(
	state: SimulationStateType,
	focusEventId: string,
	options?: { maxNodes?: number },
): CausalSubgraph {
	return new CausalGraphService().buildSubgraph(state, focusEventId, options ?? {});
}

/** ある Agent の因果を辿る起点 Event を選ぶ */
export function findCausalFocusEventForAgent(
	state: SimulationStateType,
	agentId: string,
): string | undefined {
	return new CausalGraphService().findFocusEventForAgent(state, agentId)?.id;
}

export type {
	CausalSubgraph,
	CausalGraphNode,
	CausalGraphEdge,
} from '../../domain/services/causal-graph.service';
