import { EXPERIMENT_KINDS, isCreateExperimentInput } from '@/app/api/experiments/request';
import { describe, expect, it } from 'vitest';

const VALID = {
	name: 'shock-comparison (10 seeds)',
	kind: 'shock-comparison',
	config: { seeds: 10 },
};

describe('isCreateExperimentInput', () => {
	it('name / kind / config が揃っていれば通す', () => {
		expect(isCreateExperimentInput(VALID)).toBe(true);
	});

	it('画面が読むすべての kind を通す', () => {
		for (const kind of EXPERIMENT_KINDS) {
			expect(isCreateExperimentInput({ ...VALID, kind })).toBe(true);
		}
	});

	it('未知の kind は弾く', () => {
		// どの画面からも参照できない実験行が増えるため
		expect(isCreateExperimentInput({ ...VALID, kind: 'unknown-kind' })).toBe(false);
	});

	it('name が空文字なら弾く', () => {
		expect(isCreateExperimentInput({ ...VALID, name: '' })).toBe(false);
	});

	it('config は null でも通す', () => {
		// 形が実験ごとに異なるスナップショットなので、存在だけを見る
		expect(isCreateExperimentInput({ ...VALID, config: null })).toBe(true);
	});

	it('config キーが無ければ弾く', () => {
		expect(isCreateExperimentInput({ name: VALID.name, kind: VALID.kind })).toBe(false);
	});

	it('オブジェクト以外は弾く', () => {
		// 壊れた JSON は readJsonBody が undefined にして渡すため、ここで 400 になる
		for (const body of [null, undefined, 'text', 42, true, [VALID]]) {
			expect(isCreateExperimentInput(body)).toBe(false);
		}
	});
});
