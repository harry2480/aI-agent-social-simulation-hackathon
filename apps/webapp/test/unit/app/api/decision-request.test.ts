import { isDecisionContext } from '@/app/api/agents/decision/request';
import { describe, expect, it } from 'vitest';

const VALID = {
	agent: { role: 'driver', fatigue: 70, sleepDebt: 3, responsibility: 0.5, riskTolerance: 0.5 },
	situation: { deliveryDelayMinutes: 0, deadlinePressure: 0 },
	actions: ['continue_driving', 'rest'],
};

describe('isDecisionContext', () => {
	it('agent / situation / actions が揃っていれば通す', () => {
		expect(isDecisionContext(VALID)).toBe(true);
	});

	it('situation が空でも通す。状況の項目は判断の種類ごとに変わる', () => {
		expect(isDecisionContext({ ...VALID, situation: {} })).toBe(true);
	});

	it('actions が空なら弾く', () => {
		// 選択肢の無い判断を Gateway へ渡すと、意味のない応答が返る
		expect(isDecisionContext({ ...VALID, actions: [] })).toBe(false);
	});

	it('actions が配列でなければ弾く', () => {
		expect(isDecisionContext({ ...VALID, actions: 'rest' })).toBe(false);
	});

	it('agent や situation が欠けていれば弾く', () => {
		expect(isDecisionContext({ situation: VALID.situation, actions: VALID.actions })).toBe(false);
		expect(isDecisionContext({ agent: VALID.agent, actions: VALID.actions })).toBe(false);
	});

	it('agent や situation が null なら弾く', () => {
		// typeof null === 'object' なので、null チェックが無いと素通りする
		expect(isDecisionContext({ ...VALID, agent: null })).toBe(false);
		expect(isDecisionContext({ ...VALID, situation: null })).toBe(false);
	});

	it('オブジェクト以外は弾く', () => {
		for (const body of [null, undefined, 'text', 42]) {
			expect(isDecisionContext(body)).toBe(false);
		}
	});
});
