export interface ExperimentAggregate {
	label: string;
	runCount: number;
	cascadeProbability: number;
	averageRs: number;
	peakRs: number;
	averageReach: number;
	totalSleepLossMinutes: number;
	standardDeviation: number;
	aggregate: unknown;
}

export interface StoredExperiment {
	id: string;
	name: string;
	kind: string;
	config: unknown;
	results: ExperimentAggregate[];
}

export interface ExperimentRepository {
	create(params: { name: string; kind: string; config: unknown }): Promise<string>;
	saveResults(experimentId: string, results: readonly ExperimentAggregate[]): Promise<void>;
	findById(experimentId: string): Promise<StoredExperiment | null>;
	findRecent(limit: number): Promise<StoredExperiment[]>;
}
