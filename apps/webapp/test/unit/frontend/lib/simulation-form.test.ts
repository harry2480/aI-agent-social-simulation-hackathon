import type {
	ExperimentConfigParams,
	StoredRun,
} from '@/backend/presentation/composition/simulation.composition';
import {
	DEFAULT_EXPERIMENT_SETTINGS,
	type ExperimentSettings,
} from '@/frontend/lib/experiment-settings';
import {
	formFromParams,
	formFromSettings,
	selectRun,
	toRunParams,
} from '@/frontend/lib/simulation-form';
import { describe, expect, it } from 'vitest';

function settings(overrides: Partial<ExperimentSettings> = {}): ExperimentSettings {
	return { ...DEFAULT_EXPERIMENT_SETTINGS, ...overrides };
}

function run(id: string): StoredRun {
	return {
		id,
		experimentId: 'exp-1',
		seed: 1,
		population: 300,
		days: 7,
		intervention: null,
		aiModel: null,
		status: 'completed',
		config: null,
		summary: null,
	};
}

describe('formFromSettings', () => {
	it('介入なしは null ではなく none として持つ', () => {
		// Select が null を扱えないため
		expect(formFromSettings(settings({ intervention: null })).intervention).toBe('none');
	});

	it('介入ありはそのまま持つ', () => {
		expect(formFromSettings(settings({ intervention: 'remote_work' })).intervention).toBe(
			'remote_work',
		);
	});

	it('フォームに出す項目だけを取り出す', () => {
		const form = formFromSettings(settings({ seed: 7, population: 120, days: 3 }));

		expect(form).toEqual({
			seed: 7,
			population: 120,
			days: 3,
			initialSleepDeprivedRate: DEFAULT_EXPERIMENT_SETTINGS.initialSleepDeprivedRate,
			shockTarget: DEFAULT_EXPERIMENT_SETTINGS.shockTarget,
			intervention: 'none',
			aiDecisionEnabled: DEFAULT_EXPERIMENT_SETTINGS.aiDecisionEnabled,
		});
	});
});

describe('formFromParams', () => {
	it('保存された Config をフォームへ戻す', () => {
		const params: ExperimentConfigParams = {
			seed: 42,
			population: 150,
			days: 5,
			initialSleepDeprivedRate: 0.2,
			shockTarget: 'manager',
			intervention: 'overtime_limit',
			aiDecisionEnabled: true,
		};

		expect(formFromParams(params)).toEqual({
			seed: 42,
			population: 150,
			days: 5,
			initialSleepDeprivedRate: 0.2,
			shockTarget: 'manager',
			intervention: 'overtime_limit',
			aiDecisionEnabled: true,
		});
	});

	it('省略されていた項目は安全側の既定へ寄せる', () => {
		// 古い Run の Config には項目が欠けていることがある
		const form = formFromParams({ seed: 1, population: 10, days: 1 } as ExperimentConfigParams);

		expect(form.initialSleepDeprivedRate).toBe(0);
		expect(form.shockTarget).toBe('none');
		expect(form.intervention).toBe('none');
		expect(form.aiDecisionEnabled).toBe(false);
	});
});

describe('toRunParams', () => {
	it('フォームに無い条件は Settings の保存値から引き継ぐ', () => {
		// これが無いとリセットのたびに Traffic Level や閾値が既定へ戻ってしまう
		const stored = settings({ trafficLevel: 1.8, initialSleepDebtHours: 6 });
		const params = toRunParams(formFromSettings(stored), stored);

		expect(params.trafficLevel).toBe(1.8);
		expect(params.initialSleepDebtHours).toBe(6);
		expect(params.sleepStateThresholds).toEqual(stored.sleepStateThresholds);
	});

	it('フォームの値が Settings より優先される', () => {
		const stored = settings({ seed: 1, population: 300 });
		const form = { ...formFromSettings(stored), seed: 99, population: 50 };

		const params = toRunParams(form, stored);

		expect(params.seed).toBe(99);
		expect(params.population).toBe(50);
	});

	it('Replay 元の条件は Settings より優先される', () => {
		// Replay は保存時と同じ条件で再実行するのが目的
		const stored = settings({ trafficLevel: 1 });
		const replayParams = { trafficLevel: 2.5 } as ExperimentConfigParams;

		const params = toRunParams(formFromSettings(stored), stored, replayParams);

		expect(params.trafficLevel).toBe(2.5);
	});

	it('Replay 中でもフォームで変えた値は反映される', () => {
		const stored = settings();
		const replayParams = { seed: 1, population: 300, days: 7 } as ExperimentConfigParams;
		const form = { ...formFromSettings(stored), seed: 77 };

		expect(toRunParams(form, stored, replayParams).seed).toBe(77);
	});

	it('none を選んだら介入なしへ戻す', () => {
		const stored = settings({ intervention: 'mandatory_rest' });
		const form = { ...formFromSettings(stored), intervention: 'none' as const };

		expect(toRunParams(form, stored).intervention).toBeNull();
	});
});

describe('selectRun', () => {
	const runs = [run('run-1'), run('run-2')];

	it('指定された Run を返す', () => {
		expect(selectRun(runs, 'run-2')?.id).toBe('run-2');
	});

	it('指定が無ければ先頭を返す', () => {
		expect(selectRun(runs, undefined)?.id).toBe('run-1');
	});

	it('その実験に属さない Run を指定されたら先頭へ落とす', () => {
		// 別の実験の runId を URL に貼られても 404 にはしない
		expect(selectRun(runs, 'run-999')?.id).toBe('run-1');
	});

	it('Run が 1 本も無ければ null を返す', () => {
		expect(selectRun([], 'run-1')).toBeNull();
	});
});
