import type { Prisma } from '@prisma-client';
import type {
	ExperimentAggregate,
	ExperimentRepository,
	StoredExperiment,
} from '../../domain/repositories/experiment.repository';
import { prisma } from '../db/prisma-client';
import { toStoredExperiment } from './record-mapper';

export class PrismaExperimentRepository implements ExperimentRepository {
	async create(params: { name: string; kind: string; config: unknown }): Promise<string> {
		const experiment = await prisma.experiment.create({
			data: {
				name: params.name,
				kind: params.kind,
				configJson: params.config as Prisma.InputJsonValue,
			},
		});
		return experiment.id;
	}

	async saveResults(experimentId: string, results: readonly ExperimentAggregate[]): Promise<void> {
		await prisma.$transaction([
			prisma.experimentResult.deleteMany({ where: { experimentId } }),
			prisma.experimentResult.createMany({
				data: results.map((result) => ({
					experimentId,
					label: result.label,
					runCount: result.runCount,
					cascadeProbability: result.cascadeProbability,
					averageRs: result.averageRs,
					peakRs: result.peakRs,
					averageReach: result.averageReach,
					totalSleepLossMinutes: result.totalSleepLossMinutes,
					standardDeviation: result.standardDeviation,
					aggregateJson: result.aggregate as Prisma.InputJsonValue,
				})),
			}),
		]);
	}

	async findById(experimentId: string): Promise<StoredExperiment | null> {
		const record = await prisma.experiment.findUnique({
			where: { id: experimentId },
			include: { results: true },
		});
		return record === null ? null : toStoredExperiment(record);
	}

	async findRecent(limit: number): Promise<StoredExperiment[]> {
		const records = await prisma.experiment.findMany({
			orderBy: { createdAt: 'desc' },
			take: limit,
			include: { results: true },
		});
		return records.map((record) => toStoredExperiment(record));
	}
}
