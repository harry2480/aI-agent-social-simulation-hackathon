import type { DecisionResult } from '../../domain/gateways/ai-decision.gateway';
import type { DecisionCacheGateway } from '../../domain/gateways/decision-cache.gateway';

/** 保持する最大エントリ数。超過分は最も古いものから捨てる */
const DEFAULT_MAX_ENTRIES = 5000;

/**
 * Run 内で共有する Decision Cache。プロセスをまたいだ永続化は行わない。
 *
 * Route Handler ではプロセス常駐のインスタンスを共有するため、上限が無いと
 * Context の組み合わせが増え続けてメモリを圧迫する。上限超過時は挿入順で最古を捨てる。
 */
export class InMemoryDecisionCache implements DecisionCacheGateway {
	private readonly entries = new Map<string, DecisionResult>();

	constructor(private readonly maxEntries: number = DEFAULT_MAX_ENTRIES) {}

	get(key: string): DecisionResult | undefined {
		return this.entries.get(key);
	}

	set(key: string, result: DecisionResult): void {
		if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
			const oldestKey = this.entries.keys().next().value;
			if (oldestKey !== undefined) {
				this.entries.delete(oldestKey);
			}
		}
		this.entries.set(key, result);
	}

	get size(): number {
		return this.entries.size;
	}
}
