import type { RunSummary } from '@/backend/domain/models/metrics.model';
import {
	type ExperimentRecord,
	type SimulationRunRecord,
	chunked,
	toStoredExperiment,
	toStoredRun,
} from '@/backend/infrastructure/repositories/record-mapper';
import { describe, expect, it } from 'vitest';

function runRecord(overrides: Partial<SimulationRunRecord> = {}): SimulationRunRecord {
	return {
		id: 'run-1',
		experimentId: 'exp-1',
		seed: 42,
		population: 300,
		days: 7,
		intervention: null,
		aiModel: null,
		status: 'completed',
		configJson: { seed: 42, population: 300 },
		summaryJson: { cascadeReach: 12 },
		...overrides,
	};
}

function experimentRecord(overrides: Partial<ExperimentRecord> = {}): ExperimentRecord {
	return {
		id: 'exp-1',
		name: 'intervention (10 seeds)',
		kind: 'intervention',
		configJson: { seeds: 10 },
		results: [],
		...overrides,
	};
}

describe('toStoredRun', () => {
	it('レコードの値をそのまま写す', () => {
		const stored = toStoredRun(runRecord({ intervention: 'remote_work', aiModel: 'gemma' }));

		expect(stored).toMatchObject({
			id: 'run-1',
			experimentId: 'exp-1',
			seed: 42,
			population: 300,
			days: 7,
			intervention: 'remote_work',
			aiModel: 'gemma',
			status: 'completed',
		});
	});

	it('Config はそのまま渡す。Replay が保存時の条件を必要とする', () => {
		const config = { seed: 42, population: 300, trafficLevel: 1.5 };

		expect(toStoredRun(runRecord({ configJson: config })).config).toEqual(config);
	});

	it('Summary が無い Run は null を返す', () => {
		// 中断した Run は summaryJson が null のまま残る
		expect(toStoredRun(runRecord({ summaryJson: null })).summary).toBeNull();
	});

	it('Summary の未知のフィールドを落とさない', () => {
		// 後から足した指標は JSON にしか無いため、既知の項目だけを取り出すと欠ける
		const summary = { cascadeReach: 12, outbreakOccurred: true, dampingGeneration: 3 };

		expect(toStoredRun(runRecord({ summaryJson: summary })).summary).toEqual(
			summary as unknown as RunSummary,
		);
	});

	it('experimentId を持たない Run（Watch Mode 保存）も扱える', () => {
		expect(toStoredRun(runRecord({ experimentId: null })).experimentId).toBeNull();
	});
});

describe('toStoredExperiment', () => {
	it('メタ情報と Config を写す', () => {
		const stored = toStoredExperiment(experimentRecord());

		expect(stored).toMatchObject({
			id: 'exp-1',
			name: 'intervention (10 seeds)',
			kind: 'intervention',
			config: { seeds: 10 },
		});
	});

	it('結果が無い実験は空配列を返す', () => {
		expect(toStoredExperiment(experimentRecord()).results).toEqual([]);
	});

	it('集計 JSON を解釈せずそのまま渡す', () => {
		// Outbreak 発生率のような後付けの指標はここにしか入っていない。
		// 既知のフィールドだけを取り出すと、古い実験と新しい実験で読める指標が変わる
		const aggregate = { outbreakProbability: 0.5, averageDampingGeneration: 2, futureField: 1 };
		const stored = toStoredExperiment(
			experimentRecord({
				results: [
					{
						label: 'driver-shock',
						runCount: 10,
						cascadeProbability: 0.1,
						averageRs: 0.8,
						peakRs: 2.4,
						averageReach: 55,
						totalSleepLossMinutes: 1200,
						standardDeviation: 12.5,
						aggregateJson: aggregate,
					},
				],
			}),
		);

		expect(stored.results[0]?.aggregate).toEqual(aggregate);
	});

	it('集計 JSON が無い古い結果も落とさない', () => {
		const stored = toStoredExperiment(
			experimentRecord({
				results: [
					{
						label: 'baseline',
						runCount: 10,
						cascadeProbability: 0,
						averageRs: 0,
						peakRs: 0,
						averageReach: 0,
						totalSleepLossMinutes: 0,
						standardDeviation: 0,
						aggregateJson: null,
					},
				],
			}),
		);

		expect(stored.results).toHaveLength(1);
		expect(stored.results[0]?.aggregate).toBeNull();
	});

	it('結果の並び順を保つ。比較表の行順がそのまま変わる', () => {
		const result = (label: string) => ({
			label,
			runCount: 1,
			cascadeProbability: 0,
			averageRs: 0,
			peakRs: 0,
			averageReach: 0,
			totalSleepLossMinutes: 0,
			standardDeviation: 0,
			aggregateJson: null,
		});
		const stored = toStoredExperiment(
			experimentRecord({ results: [result('baseline'), result('driver-shock')] }),
		);

		expect(stored.results.map((r) => r.label)).toEqual(['baseline', 'driver-shock']);
	});
});

describe('chunked', () => {
	it('指定件数ごとに切る', () => {
		expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
	});

	it('割り切れる場合は空のチャンクを作らない', () => {
		// 空配列で createMany を呼ぶと無駄なクエリが 1 本増える
		expect(chunked([1, 2, 3, 4], 2)).toEqual([
			[1, 2],
			[3, 4],
		]);
	});

	it('件数が上限以下なら 1 チャンク', () => {
		expect(chunked([1, 2], 1000)).toEqual([[1, 2]]);
	});

	it('空配列ではチャンクを作らない', () => {
		expect(chunked([], 1000)).toEqual([]);
	});

	it('全要素を過不足なく含む', () => {
		const items = Array.from({ length: 2500 }, (_, index) => index);

		expect(chunked(items, 1000).flat()).toEqual(items);
	});

	it('サイズが 0 以下なら例外にする。無限ループを避ける', () => {
		expect(() => chunked([1, 2], 0)).toThrow('size must be 1 or more');
	});
});
