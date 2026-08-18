import { CausalEdge } from '@/backend/domain/models/causal-edge.model';
import { describe, expect, it } from 'vitest';

describe('CausalEdge', () => {
	it('既定の寄与度は 1', () => {
		const edge = CausalEdge.create({ fromEventId: 'e1', toEventId: 'e2' });
		expect(edge.contribution).toBe(1);
	});

	it('自己参照するエッジを拒否する', () => {
		expect(() => CausalEdge.create({ fromEventId: 'e1', toEventId: 'e1' })).toThrow(
			/self-referencing/,
		);
	});

	it.each([-0.1, 1.1])('寄与度 %s を拒否する', (contribution) => {
		expect(() => CausalEdge.create({ fromEventId: 'e1', toEventId: 'e2', contribution })).toThrow(
			/contribution/,
		);
	});

	it.each([0, 0.5, 1])('寄与度 %s を受け入れる', (contribution) => {
		expect(
			CausalEdge.create({ fromEventId: 'e1', toEventId: 'e2', contribution }).contribution,
		).toBe(contribution);
	});
});
