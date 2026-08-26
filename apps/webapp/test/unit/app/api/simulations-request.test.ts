import {
	MAX_SYNCHRONOUS_AGENT_TICKS,
	exceedsSynchronousLimit,
	isCreateSimulationInput,
	parseRunDetailLevel,
} from '@/app/api/simulations/request';
import { TICKS_PER_DAY } from '@/backend/presentation/composition/watch-mode-engine.composition';
import { describe, expect, it } from 'vitest';

const VALID = { seed: 1, population: 100, days: 3, initialSleepDeprivedRate: 0.1 };

describe('isCreateSimulationInput', () => {
	it('必須 4 項目が数値なら通す', () => {
		expect(isCreateSimulationInput(VALID)).toBe(true);
	});

	it('任意項目が付いていても通す', () => {
		expect(isCreateSimulationInput({ ...VALID, intervention: 'remote_work' })).toBe(true);
	});

	it('必須項目が欠けていれば弾く', () => {
		for (const key of ['seed', 'population', 'days', 'initialSleepDeprivedRate']) {
			const body: Record<string, unknown> = { ...VALID };
			delete body[key];
			expect(isCreateSimulationInput(body)).toBe(false);
		}
	});

	it('数値であるべき項目が文字列なら弾く', () => {
		// JSON から来るため "100" が混ざりうる
		expect(isCreateSimulationInput({ ...VALID, population: '100' })).toBe(false);
	});

	it('オブジェクト以外は弾く', () => {
		for (const body of [null, undefined, 'text', 42, true]) {
			expect(isCreateSimulationInput(body)).toBe(false);
		}
	});

	it('配列も弾く', () => {
		expect(isCreateSimulationInput([VALID])).toBe(false);
	});
});

describe('exceedsSynchronousLimit', () => {
	it('標準条件（Population 300・7 日）はちょうど上限で通す', () => {
		// この規模までは Vercel Function の実行時間内に収まる
		expect(exceedsSynchronousLimit({ population: 300, days: 7 })).toBe(false);
		expect(300 * 7 * TICKS_PER_DAY).toBe(MAX_SYNCHRONOUS_AGENT_TICKS);
	});

	it('上限を 1 日でも超えれば弾く', () => {
		expect(exceedsSynchronousLimit({ population: 300, days: 8 })).toBe(true);
	});

	it('Population を増やしても同じ上限で弾く', () => {
		// 判定は Agent × Tick なので、日数と人数のどちらで超えても同じ
		expect(exceedsSynchronousLimit({ population: 2100, days: 1 })).toBe(false);
		expect(exceedsSynchronousLimit({ population: 2101, days: 1 })).toBe(true);
	});

	it('小さな Run は通す', () => {
		expect(exceedsSynchronousLimit({ population: 10, days: 1 })).toBe(false);
	});
});

describe('parseRunDetailLevel', () => {
	it('指定が無ければ summary', () => {
		expect(parseRunDetailLevel(null)).toBe('summary');
	});

	it('summary / full をそのまま返す', () => {
		expect(parseRunDetailLevel('summary')).toBe('summary');
		expect(parseRunDetailLevel('full')).toBe('full');
	});

	it('解釈できない値は既定へ倒さず null を返す', () => {
		// ?detail=all のような綴り違いが黙って summary になると気付けないため
		for (const raw of ['all', 'FULL', '', 'detail']) {
			expect(parseRunDetailLevel(raw)).toBeNull();
		}
	});
});
