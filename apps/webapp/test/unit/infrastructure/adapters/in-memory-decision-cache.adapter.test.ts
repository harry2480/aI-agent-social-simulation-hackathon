import type { DecisionResult } from '@/backend/domain/gateways/ai-decision.gateway';
import { InMemoryDecisionCache } from '@/backend/infrastructure/adapters/in-memory-decision-cache.adapter';
import { describe, expect, it } from 'vitest';

function result(action: string): DecisionResult {
	return { action, reason: 'test', model: 'rule-based' };
}

describe('InMemoryDecisionCache', () => {
	it('保存した値を取り出せる', () => {
		const cache = new InMemoryDecisionCache();
		cache.set('k1', result('rest'));
		expect(cache.get('k1')?.action).toBe('rest');
	});

	it('未登録のキーは undefined', () => {
		expect(new InMemoryDecisionCache().get('missing')).toBeUndefined();
	});

	it('同じキーへの再設定は件数を増やさない', () => {
		const cache = new InMemoryDecisionCache();
		cache.set('k1', result('rest'));
		cache.set('k1', result('continue_driving'));

		expect(cache.size).toBe(1);
		expect(cache.get('k1')?.action).toBe('continue_driving');
	});

	it('上限を超えると最も古いエントリを捨てる', () => {
		const cache = new InMemoryDecisionCache(2);
		cache.set('k1', result('a'));
		cache.set('k2', result('b'));
		cache.set('k3', result('c'));

		expect(cache.size).toBe(2);
		expect(cache.get('k1')).toBeUndefined();
		expect(cache.get('k2')?.action).toBe('b');
		expect(cache.get('k3')?.action).toBe('c');
	});

	it('上限に達していても既存キーの更新では捨てない', () => {
		const cache = new InMemoryDecisionCache(2);
		cache.set('k1', result('a'));
		cache.set('k2', result('b'));
		cache.set('k1', result('a2'));

		expect(cache.size).toBe(2);
		expect(cache.get('k1')?.action).toBe('a2');
		expect(cache.get('k2')?.action).toBe('b');
	});
});
