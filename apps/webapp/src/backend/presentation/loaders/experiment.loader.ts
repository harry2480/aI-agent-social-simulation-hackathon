import 'server-only';
import {
	type MetricsSnapshot,
	type StoredExperiment,
	type StoredRun,
	experimentRepository,
	isDatabaseConfigured,
	metricsRepository,
	simulationRunRepository,
} from '../composition/simulation.composition';

export interface ExperimentDetail {
	experiment: StoredExperiment;
	runs: StoredRun[];
}

/**
 * 画面は DB の有無で空状態の文言を変えるため、composition の判定をここから公開する。
 * ページが composition を直接参照しなくて済むようにするための再エクスポート。
 */
export { isDatabaseConfigured };

export async function loadRecentExperiments(limit = 20): Promise<StoredExperiment[]> {
	if (!isDatabaseConfigured()) {
		return [];
	}
	return experimentRepository.findRecent(limit);
}

export async function loadExperimentDetail(experimentId: string): Promise<ExperimentDetail | null> {
	if (!isDatabaseConfigured()) {
		return null;
	}
	const experiment = await experimentRepository.findById(experimentId);
	if (experiment === null) {
		return null;
	}
	const runs = await simulationRunRepository.findByExperimentId(experimentId);
	return { experiment, runs };
}

/**
 * 時系列グラフ用の Metrics。
 * Run 1 本あたり数百件になるため、Experiment 詳細では選択された Run の分だけ読む。
 */
export async function loadRunMetrics(runId: string): Promise<MetricsSnapshot[]> {
	if (!isDatabaseConfigured()) {
		return [];
	}
	return metricsRepository.findByRunId(runId);
}
