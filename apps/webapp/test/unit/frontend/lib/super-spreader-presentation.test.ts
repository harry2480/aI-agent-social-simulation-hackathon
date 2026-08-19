import type { ExperimentAggregate } from '@/backend/presentation/composition/simulation.composition';
import { toSuperSpreaderRanking } from '@/frontend/lib/super-spreader-presentation';
import { describe, expect, it } from 'vitest';

function result(label: string, aggregate: unknown): ExperimentAggregate {
	return {
		label,
		runCount: 3,
		cascadeProbability: 0.66,
		averageRs: 1.4,
		peakRs: 1.4,
		averageReach: 12,
		totalSleepLossMinutes: 900,
		standardDeviation: 0,
		aggregate,
	};
}

describe('toSuperSpreaderRanking', () => {
	it('保存順を順位として扱い、aggregate から追加指標を読む', () => {
		const rows = toSuperSpreaderRanking([
			result('agent-3', {
				role: 'driver',
				transmissionCount: 8,
				cascadeDepth: 4,
				crossNetworkSpread: 2,
				networksTraversed: ['transportation', 'work'],
			}),
			result('agent-9', { role: 'manager', transmissionCount: 5, cascadeDepth: 3 }),
		]);

		expect(rows[0]).toMatchObject({
			rank: 1,
			agentId: 'agent-3',
			role: 'driver',
			transmissionCount: 8,
			cascadeDepth: 4,
			crossNetworkSpread: 2,
			networksTraversed: ['transportation', 'work'],
		});
		expect(rows[1].rank).toBe(2);
		expect(rows[1].attributableReach).toBe(12);
	});

	it('aggregate が壊れていても既定値で表示できる', () => {
		const rows = toSuperSpreaderRanking([result('agent-1', null), result('agent-2', 'broken')]);

		expect(rows[0].role).toBe('-');
		expect(rows[0].cascadeDepth).toBe(0);
		expect(rows[0].networksTraversed).toEqual([]);
		expect(rows[1].crossNetworkSpread).toBe(0);
	});
});
