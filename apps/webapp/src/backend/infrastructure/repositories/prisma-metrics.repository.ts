import type { MetricsSnapshot } from '../../domain/models/metrics.model';
import type { MetricsRepository } from '../../domain/repositories/metrics.repository';
import { prisma } from '../db/prisma-client';

export class PrismaMetricsRepository implements MetricsRepository {
	async findByRunId(runId: string): Promise<MetricsSnapshot[]> {
		const records = await prisma.metric.findMany({
			where: { runId },
			orderBy: { tick: 'asc' },
		});
		return records.map((record) => record.snapshotJson as unknown as MetricsSnapshot);
	}
}
