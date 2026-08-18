import 'server-only';
import {
	type StoredExperiment,
	type StoredRun,
	experimentRepository,
	simulationRunRepository,
} from '../composition/simulation.composition';

export async function loadRecentExperiments(limit = 20): Promise<StoredExperiment[]> {
	return experimentRepository.findRecent(limit);
}

export async function loadExperimentDetail(
	experimentId: string,
): Promise<{ experiment: StoredExperiment; runs: StoredRun[] } | null> {
	const experiment = await experimentRepository.findById(experimentId);
	if (experiment === null) {
		return null;
	}
	const runs = await simulationRunRepository.findByExperimentId(experimentId);
	return { experiment, runs };
}
