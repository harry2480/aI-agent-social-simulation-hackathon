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
