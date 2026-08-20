import { DecisionTriggerService } from '@/backend/domain/services/decision-trigger.service';
import { describe, expect, it } from 'vitest';
import { createTestAgent } from '../../../helpers/agent';

const service = new DecisionTriggerService();

/** 何のトリガーも引かない状況 */
const CALM = {
	isDriving: false,
	isAtWorkEnd: false,
	deliveryDelayMinutes: 0,
	isHomeWithHousework: false,
	deadlinePressure: 0,
};

describe('DecisionTriggerService.evaluate', () => {
	it('判断が必要な状況が無ければ undefined を返す', () => {
		// 全 Agent を毎 Tick 推論させないためのゲート
		expect(service.evaluate(createTestAgent(), CALM)).toBeUndefined();
	});

	it('Fatigue 60 以上で運転中なら driver_fatigue を返す', () => {
		const agent = createTestAgent({ role: 'driver', fatigue: 60 });

		const request = service.evaluate(agent, { ...CALM, isDriving: true });

		expect(request?.kind).toBe('driver_fatigue');
		expect(request?.context.actions).toEqual(['continue_driving', 'rest']);
	});

	it('Fatigue が閾値未満なら運転中でも判断は発生しない', () => {
		const agent = createTestAgent({ role: 'driver', fatigue: 59.9 });

		expect(service.evaluate(agent, { ...CALM, isDriving: true })).toBeUndefined();
	});

	it('終業時刻なら work_end_overtime を返す', () => {
		const request = service.evaluate(createTestAgent(), { ...CALM, isAtWorkEnd: true });

		expect(request?.kind).toBe('work_end_overtime');
		expect(request?.context.actions).toEqual(['go_home', 'overtime']);
	});

	it('配送遅延 20 分以上で delivery_delay を返す', () => {
		const agent = createTestAgent({ role: 'delivery_worker' });

		expect(service.evaluate(agent, { ...CALM, deliveryDelayMinutes: 20 })?.kind).toBe(
			'delivery_delay',
		);
		expect(service.evaluate(agent, { ...CALM, deliveryDelayMinutes: 19 })).toBeUndefined();
	});

	it('帰宅後に家事があれば household_after_work を返す', () => {
		const request = service.evaluate(createTestAgent(), { ...CALM, isHomeWithHousework: true });

		expect(request?.kind).toBe('household_after_work');
		expect(request?.context.actions).toEqual(['do_housework', 'ask_family', 'sleep']);
	});

	it('複数の状況が重なったときは運転疲労を最優先する', () => {
		// 事故は最も影響が大きいため、他の判断より先に評価する
		const agent = createTestAgent({ role: 'driver', fatigue: 90 });

		const request = service.evaluate(agent, {
			isDriving: true,
			isAtWorkEnd: true,
			deliveryDelayMinutes: 60,
			isHomeWithHousework: true,
			deadlinePressure: 1,
		});

		expect(request?.kind).toBe('driver_fatigue');
	});

	it('終業は配送遅延より優先される', () => {
		const request = service.evaluate(createTestAgent(), {
			...CALM,
			isAtWorkEnd: true,
			deliveryDelayMinutes: 60,
		});

		expect(request?.kind).toBe('work_end_overtime');
	});

	it('Context の数値は桁を丸めて渡す', () => {
		// AI へ渡す Prompt のトークン量を抑えるため、精度をここで落とす
		const agent = createTestAgent({
			role: 'driver',
			fatigue: 72.6,
			sleepDebtHours: 3.45678,
			responsibility: 0.987654,
			riskTolerance: 0.123456,
		});

		const request = service.evaluate(agent, { ...CALM, isDriving: true });

		expect(request?.context.agent).toEqual({
			role: 'driver',
			fatigue: 73,
			sleepDebt: 3.46,
			responsibility: 0.99,
			riskTolerance: 0.12,
		});
	});

	it('household_after_work では家庭責任を状況として渡す', () => {
		const agent = createTestAgent({ familyResponsibility: 0.8 });

		const request = service.evaluate(agent, { ...CALM, isHomeWithHousework: true });

		expect(request?.context.situation).toEqual({ familyResponsibility: 0.8 });
	});
});
