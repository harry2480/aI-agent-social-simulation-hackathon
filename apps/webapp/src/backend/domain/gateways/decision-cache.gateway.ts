import type { DecisionContext, DecisionResult } from './ai-decision.gateway';

/**
 * Decision Cache。類似 Context の判断結果を再利用して AI 呼び出しコストを抑える（要件定義 16 章）。
 * キー生成は decisionContextKey が担当し、Fatigue や遅延をビニング正規化する。
 */
export interface DecisionCacheGateway {
	get(key: string): DecisionResult | undefined;
	set(key: string, result: DecisionResult): void;
}

function bin(value: number, width: number): number {
	return Math.floor(value / width) * width;
}

function level(value: number): 'low' | 'medium' | 'high' {
	if (value < 0.4) {
		return 'low';
	}
	if (value < 0.7) {
		return 'medium';
	}
	return 'high';
}

/**
 * Decision Context をビニングしてキャッシュキーへ変換する。
 * 同じ Role・似た疲労・似た遅延・似た性格なら同一キーになる。
 */
export function decisionContextKey(context: DecisionContext): string {
	const parts = [
		context.agent.role,
		`fatigue:${bin(context.agent.fatigue, 10)}`,
		`debt:${bin(context.agent.sleepDebt, 1)}`,
		`resp:${level(context.agent.responsibility)}`,
		`risk:${level(context.agent.riskTolerance)}`,
		...Object.keys(context.situation)
			.sort()
			.map((name) => `${name}:${bin(context.situation[name] ?? 0, 10)}`),
		`actions:${[...context.actions].sort().join('|')}`,
	];
	return parts.join(';');
}
