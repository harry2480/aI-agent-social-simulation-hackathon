import type { Prisma } from '@prisma-client';
import type {
	ExperimentAggregate,
	ExperimentRepository,
	StoredExperiment,
} from '../../domain/repositories/experiment.repository';
import { prisma } from '../db/prisma-client';

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
		return record === null ? null : this.toStored(record);
	}

	async findRecent(limit: number): Promise<StoredExperiment[]> {
		const records = await prisma.experiment.findMany({
			orderBy: { createdAt: 'desc' },
			take: limit,
			include: { results: true },
		});
		return records.map((record) => this.toStored(record));
	}

	private toStored(record: {
		id: string;
		name: string;
		kind: string;
		configJson: Prisma.JsonValue;
		results: {
			label: string;
			runCount: number;
			cascadeProbability: number;
			averageRs: number;
			peakRs: number;
			averageReach: number;
			totalSleepLossMinutes: number;
			standardDeviation: number;
			aggregateJson: Prisma.JsonValue;
		}[];
	}): StoredExperiment {
		return {
			id: record.id,
			name: record.name,
			kind: record.kind,
			config: record.configJson,
			results: record.results.map((result) => ({
				label: result.label,
				runCount: result.runCount,
				cascadeProbability: result.cascadeProbability,
				averageRs: result.averageRs,
				peakRs: result.peakRs,
				averageReach: result.averageReach,
				totalSleepLossMinutes: result.totalSleepLossMinutes,
				standardDeviation: result.standardDeviation,
				aggregate: result.aggregateJson,
			})),
		};
	}
}
