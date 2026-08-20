import type { DecisionContext } from '@/backend/presentation/composition/decision.composition';

/**
 * AI Decision リクエストの形を確認する。
 *
 * actions が空だと Gateway は選択肢の無い判断を求めることになり、
 * Rule-based では undefined、AI では意味のない応答が返る。
 * ここで弾いて 400 を返す。
 */
export function isDecisionContext(value: unknown): value is DecisionContext {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as Partial<DecisionContext>;
	return (
		typeof candidate.agent === 'object' &&
		candidate.agent !== null &&
		typeof candidate.situation === 'object' &&
		candidate.situation !== null &&
		Array.isArray(candidate.actions) &&
		candidate.actions.length > 0
	);
}
