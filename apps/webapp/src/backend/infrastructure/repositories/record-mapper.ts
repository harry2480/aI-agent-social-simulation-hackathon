import type { RunSummary } from '../../domain/models/metrics.model';
import type { StoredExperiment } from '../../domain/repositories/experiment.repository';
import type { StoredRun } from '../../domain/repositories/simulation-run.repository';

/**
 * Prisma のレコードをドメインの読み取りモデルへ写す変換。
 *
 * Prisma に依存しない純粋な変換としてここへ置く。JSON カラムの扱い（欠けた値を
 * どう返すか、未知のフィールドを落とさないか）が実験結果の読み取りを左右するため、
 * DB を用意せず単体で検証できるようにしている。
 */

/** JSON カラムを持つレコードは Prisma の型に依存させず、必要な形だけで受ける */
export interface SimulationRunRecord {
	id: string;
	experimentId: string | null;
	seed: number;
	population: number;
	days: number;
	intervention: string | null;
	aiModel: string | null;
	status: string;
	configJson: unknown;
	summaryJson: unknown;
}

export interface ExperimentResultRecord {
	label: string;
	runCount: number;
	cascadeProbability: number;
	averageRs: number;
	peakRs: number;
	averageReach: number;
	totalSleepLossMinutes: number;
	standardDeviation: number;
	aggregateJson: unknown;
}

export interface ExperimentRecord {
	id: string;
	name: string;
	kind: string;
	configJson: unknown;
	results: ExperimentResultRecord[];
}

/**
 * Run レコードを読み取りモデルへ写す。
 * summaryJson は Run が中断した場合に null のままになるため、そのまま null を返す。
 */
export function toStoredRun(record: SimulationRunRecord): StoredRun {
	return {
		id: record.id,
		experimentId: record.experimentId,
		seed: record.seed,
		population: record.population,
		days: record.days,
		intervention: record.intervention,
		aiModel: record.aiModel,
		status: record.status,
		config: record.configJson,
		summary: record.summaryJson === null ? null : (record.summaryJson as RunSummary),
	};
}

/**
 * Experiment レコードを読み取りモデルへ写す。
 *
 * aggregate（JSON）は解釈せずそのまま渡す。Outbreak 発生率のように後から足した
 * 指標はここにしか入っておらず、既知のフィールドだけを取り出すと古い実験と
 * 新しい実験で読める指標が変わってしまう。
 */
export function toStoredExperiment(record: ExperimentRecord): StoredExperiment {
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

/**
 * 一括書き込みのための分割。
 * 大量 Event を 1 クエリへ詰めるとクエリが肥大化するため、件数で切る。
 */
export function chunked<T>(items: readonly T[], size: number): T[][] {
	if (size < 1) {
		throw new Error(`chunked: size must be 1 or more, got ${size}`);
	}
	const chunks: T[][] = [];
	for (let offset = 0; offset < items.length; offset += size) {
		chunks.push(items.slice(offset, offset + size));
	}
	return chunks;
}
