import type { Prisma } from '@prisma-client';
import type { RunSummary } from '../../domain/models/metrics.model';
import type {
	RunPersistencePayload,
	SimulationRunRepository,
	StoredRun,
} from '../../domain/repositories/simulation-run.repository';
import { prisma } from '../db/prisma-client';
import { chunked, toStoredRun } from './record-mapper';

/** 1 回の createMany へ渡す最大件数。大量 Event でクエリが肥大化するのを防ぐ */
const BULK_CHUNK_SIZE = 1000;

/**
 * Run の永続化。書き込みは 1 トランザクションで囲み、
 * Event だけ保存されて Metrics が欠ける中途半端な状態を作らない。
 */
export class PrismaSimulationRunRepository implements SimulationRunRepository {
	async save(payload: RunPersistencePayload): Promise<string> {
		return prisma.$transaction(
			async (tx) => {
				const run = await tx.simulationRun.create({
					data: {
						experimentId: payload.experimentId ?? null,
						seed: payload.seed,
						population: payload.population,
						days: payload.days,
						intervention: payload.intervention,
						aiModel: payload.aiModel,
						status: 'completed',
						configJson: payload.config as Prisma.InputJsonValue,
						summaryJson: payload.summary as unknown as Prisma.InputJsonValue,
						completedAt: new Date(),
					},
				});

				const agentIdByKey = await this.saveAgents(tx, run.id, payload);
				const eventIdByKey = await this.saveEvents(tx, run.id, payload);
				await this.saveCausalEdges(tx, eventIdByKey, payload);
				await this.saveDecisions(tx, run.id, agentIdByKey, payload);
				await this.saveMetrics(tx, run.id, payload);

				return run.id;
			},
			// 300 Agent × 7 日の Run は Event・Metrics がまとまった件数になるため、
			// 対話型トランザクションの既定タイムアウト（5 秒）では保存しきれない
			{ timeout: 120_000, maxWait: 15_000 },
		);
	}

	async findById(runId: string): Promise<StoredRun | null> {
		const record = await prisma.simulationRun.findUnique({ where: { id: runId } });
		return record === null ? null : toStoredRun(record);
	}

	async findByExperimentId(experimentId: string): Promise<StoredRun[]> {
		const records = await prisma.simulationRun.findMany({
			where: { experimentId },
			orderBy: { startedAt: 'asc' },
		});
		return records.map((record) => toStoredRun(record));
	}

	async findRecent(limit: number): Promise<StoredRun[]> {
		const records = await prisma.simulationRun.findMany({
			orderBy: { startedAt: 'desc' },
			take: limit,
		});
		return records.map((record) => toStoredRun(record));
	}

	private async saveAgents(
		tx: Prisma.TransactionClient,
		runId: string,
		payload: RunPersistencePayload,
	): Promise<Map<string, string>> {
		await this.createInChunks(payload.agents, (chunk) =>
			tx.agent.createMany({
				data: chunk.map((agent) => ({
					runId,
					agentKey: agent.agentKey,
					role: agent.role,
					homeId: agent.homeId,
					workplaceId: agent.workplaceId ?? null,
					sleepNeedHours: agent.sleepNeedHours,
					responsibility: agent.responsibility,
					riskTolerance: agent.riskTolerance,
					cooperativeness: agent.cooperativeness,
					familyResponsibility: agent.familyResponsibility,
					finalSleepDebtHours: agent.finalSleepDebtHours,
					finalFatigue: agent.finalFatigue,
					finalStress: agent.finalStress,
					finalSleepState: agent.finalSleepState,
				})),
			}),
		);

		const saved = await tx.agent.findMany({
			where: { runId },
			select: { id: true, agentKey: true },
		});
		const idByKey = new Map(saved.map((agent) => [agent.agentKey, agent.id]));

		const relationships = payload.relationships
			.map((relationship) => ({
				fromAgentId: idByKey.get(relationship.fromAgentKey),
				toAgentId: idByKey.get(relationship.toAgentKey),
				kind: relationship.kind,
			}))
			.filter(
				(relationship): relationship is { fromAgentId: string; toAgentId: string; kind: string } =>
					relationship.fromAgentId !== undefined && relationship.toAgentId !== undefined,
			);
		await this.createInChunks(relationships, (chunk) =>
			tx.agentRelationship.createMany({ data: chunk }),
		);

		return idByKey;
	}

	private async saveEvents(
		tx: Prisma.TransactionClient,
		runId: string,
		payload: RunPersistencePayload,
	): Promise<Map<string, string>> {
		await this.createInChunks(payload.events, (chunk) =>
			tx.event.createMany({
				data: chunk.map((event) => ({
					runId,
					eventKey: event.eventKey,
					tick: event.tick,
					type: event.type,
					actorKey: event.actorKey ?? null,
					targetKeys: [...event.targetKeys],
					depth: event.depth,
					impactJson: event.impact as Prisma.InputJsonValue,
				})),
			}),
		);

		const saved = await tx.event.findMany({
			where: { runId },
			select: { id: true, eventKey: true },
		});
		return new Map(saved.map((event) => [event.eventKey, event.id]));
	}

	private async saveCausalEdges(
		tx: Prisma.TransactionClient,
		eventIdByKey: Map<string, string>,
		payload: RunPersistencePayload,
	): Promise<void> {
		// 保存対象は重要 Event のみのため、両端が保存された Edge だけを残す
		const edges = payload.causalEdges
			.map((edge) => ({
				fromEventId: eventIdByKey.get(edge.fromEventKey),
				toEventId: eventIdByKey.get(edge.toEventKey),
				contribution: edge.contribution,
			}))
			.filter(
				(edge): edge is { fromEventId: string; toEventId: string; contribution: number } =>
					edge.fromEventId !== undefined && edge.toEventId !== undefined,
			);
		await this.createInChunks(edges, (chunk) => tx.causalEdge.createMany({ data: chunk }));
	}

	private async saveDecisions(
		tx: Prisma.TransactionClient,
		runId: string,
		agentIdByKey: Map<string, string>,
		payload: RunPersistencePayload,
	): Promise<void> {
		const decisions = payload.decisions.map((decision) => ({
			runId,
			agentId: agentIdByKey.get(decision.agentKey) ?? null,
			tick: decision.tick,
			action: decision.action,
			reason: decision.reason,
			model: decision.model,
			contextJson: decision.context as Prisma.InputJsonValue,
		}));
		await this.createInChunks(decisions, (chunk) => tx.agentDecision.createMany({ data: chunk }));
	}

	private async saveMetrics(
		tx: Prisma.TransactionClient,
		runId: string,
		payload: RunPersistencePayload,
	): Promise<void> {
		const metrics = payload.metrics.map((snapshot) => ({
			runId,
			tick: snapshot.tick,
			snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
		}));
		await this.createInChunks(metrics, (chunk) => tx.metric.createMany({ data: chunk }));
	}

	private async createInChunks<T>(
		items: readonly T[],
		write: (chunk: T[]) => Promise<unknown>,
	): Promise<void> {
		for (const chunk of chunked(items, BULK_CHUNK_SIZE)) {
			await write(chunk);
		}
	}
}
