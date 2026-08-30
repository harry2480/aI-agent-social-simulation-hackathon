import { RunExperimentUseCase } from '@/backend/application/usecases/run-experiment.usecase';
import type { ExperimentConfigParams } from '@/backend/domain/models/experiment-config.model';
import { experimentPlanOf } from '@/backend/domain/models/experiment-plan.model';
import { RuleBasedAiDecisionGateway } from '@/backend/infrastructure/adapters/rule-based-ai-decision.adapter';
import { describe, expect, it } from 'vitest';

/** Unit テストでは小さな都市で回す。条件の組み立てとループの検証が目的 */
const BASE: ExperimentConfigParams = {
	seed: 0,
	population: 20,
	days: 1,
	initialSleepDeprivedRate: 0.2,
	shockTarget: 'driver',
};

function useCase(): RunExperimentUseCase {
	return new RunExperimentUseCase(new RuleBasedAiDecisionGateway());
}

describe('RunExperimentUseCase', () => {
	it('条件ごとに Seed 数だけ Run を回して集計する', async () => {
		let runs = 0;
		const results = await useCase().execute({
			kind: 'intervention',
			seeds: 2,
			base: BASE,
			onRunFinished: () => {
				runs += 1;
			},
		});

		const conditions = experimentPlanOf('intervention').conditions;
		expect(results.map((result) => result.label)).toEqual(
			conditions.map((condition) => condition.label),
		);
		expect(runs).toBe(conditions.length * 2);
		expect(results.every((result) => result.runCount === 2)).toBe(true);
	});

	it('判定だけを振る実験は Run を回し直さず、同じ Run を数え直す', async () => {
		// 判定条件は Simulation の挙動に影響しないため、Seed ごとに 1 本で足りる
		let runs = 0;
		const results = await useCase().execute({
			kind: 'cascade-threshold',
			seeds: 2,
			base: BASE,
			onRunFinished: () => {
				runs += 1;
			},
		});

		expect(runs).toBe(2);
		expect(results).toHaveLength(experimentPlanOf('cascade-threshold').conditions.length);
		// 同じ Run を数え直しているため、判定に依らない指標はすべての行で一致する
		const reaches = new Set(results.map((result) => result.averageReach));
		expect(reaches.size).toBe(1);
	});

	it('進捗は Run が終わるたびに総数へ向かって進む', async () => {
		const progress: number[] = [];
		let total = 0;
		await useCase().execute({
			kind: 'shock-comparison',
			seeds: 1,
			base: BASE,
			onProgress: (current) => {
				progress.push(current.done);
				total = current.total;
			},
		});

		expect(total).toBe(experimentPlanOf('shock-comparison').conditions.length);
		expect(progress).toEqual([1, 2, 3, 4]);
	});

	it('同一 Seed・同一条件なら結果が再現する（要件定義 44 章）', async () => {
		const first = await useCase().execute({ kind: 'shock-comparison', seeds: 1, base: BASE });
		const second = await useCase().execute({ kind: 'shock-comparison', seeds: 1, base: BASE });

		expect(second).toEqual(first);
	});

	it('Seed 数が 1 未満なら Run を 1 本も回さずに弾く', async () => {
		await expect(
			useCase().execute({ kind: 'shock-comparison', seeds: 0, base: BASE }),
		).rejects.toThrow('1 以上の整数');
	});

	it('条件と base の組み合わせが不正なら例外にする', async () => {
		await expect(
			useCase().execute({ kind: 'shock-comparison', seeds: 1, base: { ...BASE, population: 0 } }),
		).rejects.toThrow('invalid experiment config');
	});
});
