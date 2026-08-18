import type { AgentRole } from '../../domain/models/agent.model';
import type { SleepStateName } from '../../domain/models/sleep-state.model';
import type { AgentRepository } from '../../domain/repositories/agent.repository';
import type { AgentSnapshot } from '../../domain/repositories/simulation-run.repository';
import { prisma } from '../db/prisma-client';

export class PrismaAgentRepository implements AgentRepository {
	async findByRunId(runId: string): Promise<AgentSnapshot[]> {
		const records = await prisma.agent.findMany({
			where: { runId },
			orderBy: { agentKey: 'asc' },
		});
		return records.map((record) => ({
			agentKey: record.agentKey,
			role: record.role as AgentRole,
			homeId: record.homeId,
			workplaceId: record.workplaceId ?? undefined,
			sleepNeedHours: record.sleepNeedHours,
			responsibility: record.responsibility,
			riskTolerance: record.riskTolerance,
			cooperativeness: record.cooperativeness,
			familyResponsibility: record.familyResponsibility,
			finalSleepDebtHours: record.finalSleepDebtHours,
			finalFatigue: record.finalFatigue,
			finalStress: record.finalStress,
			finalSleepState: record.finalSleepState as SleepStateName,
		}));
	}
}
