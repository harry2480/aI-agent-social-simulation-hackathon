import type { EventImpact, EventType } from '../../domain/models/simulation-event.model';
import type { EventRepository } from '../../domain/repositories/event.repository';
import type {
	CausalEdgeSnapshot,
	EventSnapshot,
} from '../../domain/repositories/simulation-run.repository';
import { prisma } from '../db/prisma-client';

export class PrismaEventRepository implements EventRepository {
	async findByRunId(runId: string): Promise<EventSnapshot[]> {
		const records = await prisma.event.findMany({
			where: { runId },
			orderBy: { tick: 'asc' },
		});
		return records.map((record) => ({
			eventKey: record.eventKey,
			tick: record.tick,
			type: record.type as EventType,
			actorKey: record.actorKey ?? undefined,
			targetKeys: record.targetKeys,
			depth: record.depth,
			impact: record.impactJson as EventImpact,
		}));
	}

	async findCausalEdgesByRunId(runId: string): Promise<CausalEdgeSnapshot[]> {
		const records = await prisma.causalEdge.findMany({
			where: { fromEvent: { runId } },
			include: {
				fromEvent: { select: { eventKey: true } },
				toEvent: { select: { eventKey: true } },
			},
		});
		return records.map((record) => ({
			fromEventKey: record.fromEvent.eventKey,
			toEventKey: record.toEvent.eventKey,
			contribution: record.contribution,
		}));
	}
}
