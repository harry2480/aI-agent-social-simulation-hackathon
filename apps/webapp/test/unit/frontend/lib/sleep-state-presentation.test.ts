import {
	SLEEP_STATE_ORDER,
	sleepStateColorVars,
	sleepStatePresentation,
} from '@/frontend/lib/sleep-state-presentation';
import { describe, expect, it } from 'vitest';

describe('sleepStatePresentation', () => {
	it('全ての睡眠状態に表示定義がある', () => {
		for (const state of SLEEP_STATE_ORDER) {
			const presentation = sleepStatePresentation(state);
			expect(presentation.label.length).toBeGreaterThan(0);
			expect(presentation.colorVar.startsWith('--color-')).toBe(true);
			expect(presentation.marker.length).toBeGreaterThan(0);
		}
	});

	it('状態ごとにマーカー形状が異なる（色だけに頼らない）', () => {
		const markers = SLEEP_STATE_ORDER.map((state) => sleepStatePresentation(state).marker);
		expect(new Set(markers).size).toBe(SLEEP_STATE_ORDER.length);
	});

	it('状態ごとに色トークンが異なる', () => {
		const vars = SLEEP_STATE_ORDER.map((state) => sleepStatePresentation(state).colorVar);
		expect(new Set(vars).size).toBe(SLEEP_STATE_ORDER.length);
	});

	it('SLEEP_STATE_ORDER は軽い順に並ぶ', () => {
		expect(SLEEP_STATE_ORDER).toEqual([
			'normal',
			'tired',
			'sleep_deprived',
			'severe_sleep_deprived',
		]);
	});
});

describe('sleepStateColorVars', () => {
	it('全状態分の CSS 変数名を返す', () => {
		const vars = sleepStateColorVars();
		expect(Object.keys(vars).sort()).toEqual([...SLEEP_STATE_ORDER].sort());
		for (const state of SLEEP_STATE_ORDER) {
			expect(vars[state]).toBe(sleepStatePresentation(state).colorVar);
		}
	});
});
