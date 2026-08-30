import { EXPERIMENT_KINDS } from '@/backend/domain/models/experiment-kind.model';
import {
	BATCH_EXPERIMENT_KINDS,
	DEFAULT_BATCH_BASE,
	experimentPlanOf,
	isBatchExperimentKind,
	judgementLabel,
	totalRunCount,
} from '@/backend/domain/models/experiment-plan.model';
import { describe, expect, it } from 'vitest';

describe('experimentPlanOf', () => {
	it('Shock 比較は Baseline と 3 種の Shock を並べる（要件定義 26 章）', () => {
		const plan = experimentPlanOf('shock-comparison');

		expect(plan.mode).toBe('run');
		expect(plan.conditions.map((condition) => condition.label)).toEqual([
			'baseline',
			'random-shock',
			'driver-shock',
			'manager-shock',
		]);
	});

	it('Critical Point Sweep は初期睡眠不足率を 1〜20% で振る（要件定義 30 章）', () => {
		const plan = experimentPlanOf('critical-point');

		expect(plan.conditions.map((condition) => condition.label)).toEqual([
			'initial-rate-1%',
			'initial-rate-3%',
			'initial-rate-5%',
			'initial-rate-7%',
			'initial-rate-10%',
			'initial-rate-15%',
			'initial-rate-20%',
		]);
	});

	it('Intervention は対照条件と介入 4 種を並べる（要件定義 32 章）', () => {
		const plan = experimentPlanOf('intervention');

		expect(plan.conditions).toHaveLength(5);
		expect(plan.conditions[0]?.label).toBe('none');
	});

	it('Cascade 判定の感度分析は Run ではなく判定条件を振る', () => {
		// 判定条件は Simulation の挙動に影響しないため、Run を回し直す必要が無い
		const plan = experimentPlanOf('cascade-threshold');

		expect(plan.mode).toBe('judgement');
		expect(plan.conditions[0]?.label).toBe('Rs>1 x2世代 / Reach>=10%');
		expect(plan.conditions.length).toBeGreaterThan(1);
	});

	it('比較実験で変えるのは Experimental Variable だけにする（要件定義 28 章）', () => {
		// base に無いキーを条件が持つと、意図しない条件差が入る
		const allowed = new Set(Object.keys(DEFAULT_BATCH_BASE));
		for (const kind of ['shock-comparison', 'critical-point', 'intervention'] as const) {
			const plan = experimentPlanOf(kind);
			if (plan.mode !== 'run') {
				throw new Error(`${kind} は run モードのはず`);
			}
			for (const condition of plan.conditions) {
				for (const key of Object.keys(condition.overrides)) {
					expect(allowed.has(key) || key === 'intervention').toBe(true);
				}
			}
		}
	});
});

describe('totalRunCount', () => {
	it('条件ごとに Run を回す実験は 条件数 × Seed 数', () => {
		expect(totalRunCount(experimentPlanOf('shock-comparison'), 5)).toBe(20);
	});

	it('判定だけを振る実験は Seed 数のまま増えない', () => {
		// 同じ Run を判定条件の数だけ数え直すため
		expect(totalRunCount(experimentPlanOf('cascade-threshold'), 5)).toBe(5);
	});
});

describe('judgementLabel', () => {
	it('判定条件をそのまま読める 1 行にする', () => {
		expect(judgementLabel({ rsThreshold: 1, minGenerations: 2, minReachRate: 0.05 })).toBe(
			'Rs>1 x2世代 / Reach>=5%',
		);
	});
});

describe('isBatchExperimentKind', () => {
	it('Batch 実行できる種別だけを受け付ける', () => {
		expect(isBatchExperimentKind('critical-point')).toBe(true);
		// Super-spreader は専用の 2 段階探索があり、条件表からは回せない
		expect(isBatchExperimentKind('super-spreader')).toBe(false);
		expect(isBatchExperimentKind(null)).toBe(false);
	});

	it('Batch の種別はすべて画面が読む kind 一覧に含まれる', () => {
		// ここから漏れると、保存した実験がどの画面からも参照されないまま残る
		for (const kind of BATCH_EXPERIMENT_KINDS) {
			expect(EXPERIMENT_KINDS).toContain(kind);
		}
	});
});
