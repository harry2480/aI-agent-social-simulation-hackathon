import { ProbabilisticEventService } from '@/backend/domain/services/probabilistic-event.service';
import { SeededRandomService } from '@/backend/domain/services/seeded-random.service';
import { describe, expect, it } from 'vitest';
import { createTestAgent } from '../../../helpers/agent';

const service = new ProbabilisticEventService(new SeededRandomService(1));

describe('ProbabilisticEventService.accidentProbability', () => {
	it('疲労 100 は疲労 0 の 6 倍になる', () => {
		const rested = service.accidentProbability(createTestAgent({ fatigue: 0 }), 1);
		const exhausted = service.accidentProbability(createTestAgent({ fatigue: 100 }), 1);

		expect(exhausted).toBeCloseTo(rested * 6, 10);
	});

	it('ストレス 100 はストレス 0 の 2.5 倍になる', () => {
		const calm = service.accidentProbability(createTestAgent({ stress: 0 }), 1);
		const stressed = service.accidentProbability(createTestAgent({ stress: 100 }), 1);

		expect(stressed).toBeCloseTo(calm * 2.5, 10);
	});

	it('リスク許容度が高いほど事故率が上がる', () => {
		const cautious = service.accidentProbability(createTestAgent({ riskTolerance: 0 }), 1);
		const reckless = service.accidentProbability(createTestAgent({ riskTolerance: 1 }), 1);

		expect(reckless).toBeGreaterThan(cautious);
	});

	it('交通量に比例して上がる', () => {
		const agent = createTestAgent({ fatigue: 50 });

		expect(service.accidentProbability(agent, 2)).toBeCloseTo(
			service.accidentProbability(agent, 1) * 2,
			10,
		);
	});

	it('交通量が 0.1 を下回っても 0.1 として扱う', () => {
		// 交通量 0 で事故率が 0 になると、Traffic Level を下げただけで
		// 事故由来の Cascade が完全に消えてしまう
		const agent = createTestAgent({ fatigue: 50 });

		expect(service.accidentProbability(agent, 0)).toBe(service.accidentProbability(agent, 0.1));
	});

	it('上限 0.4 でクリップされる', () => {
		const worst = createTestAgent({ fatigue: 100, stress: 100, riskTolerance: 1 });

		expect(service.accidentProbability(worst, 100)).toBe(0.4);
	});
});

describe('ProbabilisticEventService.workFailureProbability', () => {
	it('疲労とストレスの倍率だけで決まる', () => {
		const rested = service.workFailureProbability(createTestAgent({ fatigue: 0, stress: 0 }));
		const exhausted = service.workFailureProbability(
			createTestAgent({ fatigue: 100, stress: 100 }),
		);

		expect(rested).toBeCloseTo(0.002, 10);
		expect(exhausted).toBeCloseTo(0.002 * 6 * 2.5, 10);
	});

	it('最悪条件でも 3% 程度にとどまる', () => {
		// Fatigue / Stress は Agent 側で 0〜100 にクランプされるため、
		// workFailureProbability は実装にある上限 0.4 へ到達しない。
		// 事故と違って作業ミスは「たまに起きる」程度に収める設計であることを固定しておく
		const worst = service.workFailureProbability(createTestAgent({ fatigue: 100, stress: 100 }));

		expect(worst).toBeCloseTo(0.03, 10);
		expect(worst).toBeLessThan(0.4);
	});

	it('リスク許容度は作業ミスに影響しない', () => {
		const cautious = createTestAgent({ fatigue: 50, riskTolerance: 0 });
		const reckless = createTestAgent({ fatigue: 50, riskTolerance: 1 });

		expect(service.workFailureProbability(cautious)).toBe(service.workFailureProbability(reckless));
	});
});

describe('ProbabilisticEventService.rollAccident', () => {
	it('リスクのある行動を選んでいなければ抽選せず false を返す', () => {
		// AI は「事故を起こすか」ではなく「事故リスクのある行動を取るか」を決める
		const worst = createTestAgent({ fatigue: 100, stress: 100, riskTolerance: 1 });

		const occurred = service.rollAccident(worst, { trafficLevel: 100, riskyActionChosen: false });

		expect(occurred).toBe(false);
	});

	it('同じ Seed なら同じ結果になる', () => {
		const agent = createTestAgent({ fatigue: 90, stress: 90 });
		const roll = (): boolean[] => {
			const rolling = new ProbabilisticEventService(new SeededRandomService(7));
			return Array.from({ length: 50 }, () =>
				rolling.rollAccident(agent, { trafficLevel: 1, riskyActionChosen: true }),
			);
		};

		expect(roll()).toEqual(roll());
	});
});
