'use server';

import { revalidatePath } from 'next/cache';
import {
	type AgentSnapshot,
	type CausalEdgeSnapshot,
	type DecisionSnapshot,
	type EventSnapshot,
	ExperimentConfig,
	type MetricsSnapshot,
	type RelationshipSnapshot,
	type RunSummary,
	createExperimentRunSimulationUseCase,
	simulationRunRepository,
} from '../composition/simulation.composition';

export interface CreateSimulationInput {
	seed: number;
	population: number;
	days: number;
	initialSleepDeprivedRate: number;
	initialSleepDebtHours?: number;
	shockTarget?: 'none' | 'random' | 'driver' | 'manager';
	intervention?: 'mandatory_rest' | 'overtime_limit' | 'flexible_work' | 'remote_work' | null;
	trafficLevel?: number;
}

/** サーバー側で Run を実行して保存する（小規模な単発 Run 向け） */
export async function runSimulationAction(
	input: CreateSimulationInput,
): Promise<{ runId: string | null; summary: RunSummary }> {
	const configResult = ExperimentConfig.create(input);
	if (!configResult.success) {
		// domain は Result を返すため、Application/Presentation 側で例外へ変換する
		throw new Error(`invalid experiment config: ${configResult.error}`);
	}

	const useCase = createExperimentRunSimulationUseCase();
	const result = await useCase.execute({ config: configResult.value, persist: true });

	revalidatePath('/');
	return { runId: result.runId, summary: result.summary };
}

export interface PersistWatchRunInput {
	config: unknown;
	seed: number;
	population: number;
	days: number;
	intervention: string | null;
	aiModel: string | null;
	summary: RunSummary;
	agents: AgentSnapshot[];
	relationships: RelationshipSnapshot[];
	events: EventSnapshot[];
	causalEdges: CausalEdgeSnapshot[];
	decisions: DecisionSnapshot[];
	metrics: MetricsSnapshot[];
}

/**
 * Watch Mode（ブラウザ実行）の結果を永続化する。
 * ブラウザからは Prisma を呼べないため、Server Action 経由でまとめて送信する。
 */
export async function persistWatchRunAction(
	input: PersistWatchRunInput,
): Promise<{ runId: string }> {
	const runId = await simulationRunRepository.save({
		experimentId: null,
		seed: input.seed,
		population: input.population,
		days: input.days,
		intervention: input.intervention,
		aiModel: input.aiModel,
		config: input.config,
		summary: input.summary,
		agents: input.agents,
		relationships: input.relationships,
		events: input.events,
		causalEdges: input.causalEdges,
		decisions: input.decisions,
		metrics: input.metrics,
	});

	revalidatePath('/');
	return { runId };
}
