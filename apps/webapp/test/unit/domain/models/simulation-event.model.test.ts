import { MAX_EVENT_DEPTH, SimulationEvent } from '@/backend/domain/models/simulation-event.model';
import { describe, expect, it } from 'vitest';

describe('SimulationEvent', () => {
	it('原因が無い Event の depth は 0', () => {
		const event = SimulationEvent.create({ id: 'e1', tick: 0, type: 'accident' });
		expect(event.depth).toBe(0);
	});

	it('depth は原因の最大 depth + 1 になる', () => {
		const root = SimulationEvent.create({ id: 'e1', tick: 0, type: 'accident' });
		const child = SimulationEvent.create({
			id: 'e2',
			tick: 1,
			type: 'traffic_jam',
			causes: [root],
		});
		const grandchild = SimulationEvent.create({
			id: 'e3',
			tick: 2,
			type: 'commute_delay',
			causes: [root, child],
		});
		expect(child.depth).toBe(1);
		expect(grandchild.depth).toBe(2);
	});

	it('causedByEventIds には渡された原因 Event の ID のみが入る', () => {
		const cause = SimulationEvent.create({ id: 'e1', tick: 0, type: 'accident' });
		const event = SimulationEvent.create({
			id: 'e2',
			tick: 5,
			type: 'traffic_jam',
			causes: [cause],
		});
		expect(event.causedByEventIds).toEqual(['e1']);
	});

	it('伝播 Depth 上限に達すると isAtMaxDepth が true になる', () => {
		let event = SimulationEvent.create({ id: 'e0', tick: 0, type: 'accident' });
		for (let i = 1; i < MAX_EVENT_DEPTH; i++) {
			event = SimulationEvent.create({
				id: `e${i}`,
				tick: i,
				type: 'commute_delay',
				causes: [event],
			});
			expect(event.isAtMaxDepth).toBe(false);
		}
		const atLimit = SimulationEvent.create({
			id: 'e-limit',
			tick: MAX_EVENT_DEPTH,
			type: 'commute_delay',
			causes: [event],
		});
		expect(atLimit.depth).toBe(MAX_EVENT_DEPTH);
		expect(atLimit.isAtMaxDepth).toBe(true);
	});
});

describe('SimulationEvent.reconstruct', () => {
	it('保存済みの値をそのまま復元する', () => {
		const event = SimulationEvent.reconstruct({
			id: 'e42',
			tick: 120,
			type: 'sleep_opportunity_loss',
			actorId: 'agent-0001',
			targetIds: ['agent-0002'],
			causedByEventIds: ['e40', 'e41'],
			impact: { sleepLossMinutes: 45 },
			depth: 4,
		});

		expect(event.id).toBe('e42');
		expect(event.tick).toBe(120);
		expect(event.actorId).toBe('agent-0001');
		expect(event.targetIds).toEqual(['agent-0002']);
		expect(event.causedByEventIds).toEqual(['e40', 'e41']);
		expect(event.impact.sleepLossMinutes).toBe(45);
		expect(event.depth).toBe(4);
	});

	it('復元しても depth の再計算は行わない', () => {
		const event = SimulationEvent.reconstruct({
			id: 'e1',
			tick: 0,
			type: 'accident',
			targetIds: [],
			causedByEventIds: [],
			impact: {},
			depth: 7,
		});
		expect(event.depth).toBe(7);
	});
});

describe('SimulationEvent.isSignificant', () => {
	it('事故・遅延・伝播は重要 Event として扱う', () => {
		for (const type of ['accident', 'traffic_jam', 'late_arrival', 'sleep_deprived'] as const) {
			expect(SimulationEvent.create({ id: 'e', tick: 0, type }).isSignificant).toBe(true);
		}
	});

	it('decision は件数が多いため重要 Event に含めない', () => {
		expect(SimulationEvent.create({ id: 'e', tick: 0, type: 'decision' }).isSignificant).toBe(
			false,
		);
	});

	it('recovery は重要 Event に含めない', () => {
		expect(SimulationEvent.create({ id: 'e', tick: 0, type: 'recovery' }).isSignificant).toBe(
			false,
		);
	});
});
