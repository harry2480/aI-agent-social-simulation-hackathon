import { InterventionService } from '@/backend/domain/services/intervention.service';
import { describe, expect, it } from 'vitest';
import { createTestAgent } from '../../../helpers/agent';

describe('InterventionService.forcesRest', () => {
	const service = new InterventionService('mandatory_rest');

	it('Fatigue 80 以上の Driver / Delivery Worker に休憩を強制する', () => {
		expect(service.forcesRest(createTestAgent({ role: 'driver', fatigue: 80 }))).toBe(true);
		expect(service.forcesRest(createTestAgent({ role: 'delivery_worker', fatigue: 95 }))).toBe(
			true,
		);
	});

	it('閾値未満なら強制しない', () => {
		expect(service.forcesRest(createTestAgent({ role: 'driver', fatigue: 79.9 }))).toBe(false);
	});

	it('運転しない職種は対象外', () => {
		expect(service.forcesRest(createTestAgent({ role: 'office_worker', fatigue: 100 }))).toBe(
			false,
		);
		expect(service.forcesRest(createTestAgent({ role: 'manager', fatigue: 100 }))).toBe(false);
	});

	it('介入なしでは強制しない', () => {
		const none = new InterventionService(null);

		expect(none.forcesRest(createTestAgent({ role: 'driver', fatigue: 100 }))).toBe(false);
	});
});

describe('InterventionService.maxOvertimeTicks', () => {
	it('Overtime Limit では 4 Tick に制限する', () => {
		// 既定の残業量（最大 1 時間 45 分 = 7 Tick）より小さくないと制限が一度も効かない
		expect(new InterventionService('overtime_limit').maxOvertimeTicks()).toBe(4);
	});

	it('他の介入では上限を設けない', () => {
		expect(new InterventionService(null).maxOvertimeTicks()).toBe(Number.POSITIVE_INFINITY);
		expect(new InterventionService('remote_work').maxOvertimeTicks()).toBe(
			Number.POSITIVE_INFINITY,
		);
	});
});

describe('InterventionService.requiresLatenessCompensation', () => {
	it('Flexible Work のときだけ遅刻分の補填が不要になる', () => {
		expect(new InterventionService('flexible_work').requiresLatenessCompensation()).toBe(false);
		expect(new InterventionService(null).requiresLatenessCompensation()).toBe(true);
		expect(new InterventionService('mandatory_rest').requiresLatenessCompensation()).toBe(true);
	});
});

describe('InterventionService.isRemoteWorker', () => {
	const service = new InterventionService('remote_work');

	it('Office Worker の半数（index が偶数）をリモート勤務にする', () => {
		const agent = createTestAgent({ role: 'office_worker' });

		expect(service.isRemoteWorker(agent, 0)).toBe(true);
		expect(service.isRemoteWorker(agent, 1)).toBe(false);
		expect(service.isRemoteWorker(agent, 2)).toBe(true);
	});

	it('Office Worker 以外は通勤する', () => {
		// 運転職と店舗職は出勤が業務そのものであり、リモート化できない
		for (const role of ['driver', 'delivery_worker', 'store_worker', 'manager'] as const) {
			expect(service.isRemoteWorker(createTestAgent({ role }), 0)).toBe(false);
		}
	});

	it('他の介入ではリモート勤務にならない', () => {
		const none = new InterventionService(null);

		expect(none.isRemoteWorker(createTestAgent({ role: 'office_worker' }), 0)).toBe(false);
	});
});
