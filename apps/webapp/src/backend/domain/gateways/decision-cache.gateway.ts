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
	// 0.3 / 0.1 は 2.9999999999999996 になり、そのまま floor すると 1 つ下のビンへ落ちる。
	// 商を丸め誤差分だけ持ち上げてから floor し、境界値を本来のビンへ入れる
	const quotient = value / width;
	const corrected = quotient + Number.EPSILON * Math.max(1, Math.abs(quotient));
	// 掛け戻しでも誤差が出る（0.1 幅で 0.7000000000000001）ため桁を固定する
	return Number((Math.floor(corrected) * width).toFixed(4));
}

/**
 * situation の値はスケールが混在する（分単位の遅延と 0〜1 の圧力）。
 * 一律のビン幅にすると 0〜1 の値がすべて同じビンへ潰れ、
 * deadlinePressure の高低で判断が変わる状況を Cache が区別できなくなる。
 */
const SITUATION_BIN_WIDTHS: Record<string, number> = {
	deliveryDelayMinutes: 10,
	deadlinePressure: 0.1,
	familyResponsibility: 0.1,
};

/** 未知の situation は分単位の量とみなす */
const DEFAULT_SITUATION_BIN_WIDTH = 10;

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
		...Object.entries(context.situation)
			.sort(([left], [right]) => (left < right ? -1 : 1))
			.map(
				([name, value]) =>
					`${name}:${bin(value, SITUATION_BIN_WIDTHS[name] ?? DEFAULT_SITUATION_BIN_WIDTH)}`,
			),
		`actions:${[...context.actions].sort().join('|')}`,
	];
	return parts.join(';');
}
