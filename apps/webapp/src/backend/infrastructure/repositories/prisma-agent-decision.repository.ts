import type { AgentDecisionRepository } from '../../domain/repositories/agent-decision.repository';
import type { DecisionSnapshot } from '../../domain/repositories/simulation-run.repository';
import { prisma } from '../db/prisma-client';

export class PrismaAgentDecisionRepository implements AgentDecisionRepository {
	async findByRunId(runId: string, limit: number): Promise<DecisionSnapshot[]> {
		const records = await prisma.agentDecision.findMany({
			where: { runId },
			orderBy: { tick: 'desc' },
			take: limit,
			include: { agent: { select: { agentKey: true } } },
		});
		return records.map((record) => ({
			agentKey: record.agent?.agentKey ?? 'unknown',
			tick: record.tick,
			action: record.action,
			reason: record.reason,
			model: record.model,
			context: record.contextJson,
		}));
	}
}
