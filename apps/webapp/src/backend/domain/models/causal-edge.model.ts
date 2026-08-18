/**
 * Event 間の因果エッジ。
 * 「原因 Event の出力値を結果 Event の計算処理が参照した」場合にのみ生成する。
 */
export class CausalEdge {
	private constructor(
		public readonly fromEventId: string,
		public readonly toEventId: string,
		/** 結果 Event の影響量のうち、この原因が寄与した割合（0〜1） */
		public readonly contribution: number,
	) {}

	static create(params: {
		fromEventId: string;
		toEventId: string;
		contribution?: number;
	}): CausalEdge {
		if (params.fromEventId === params.toEventId) {
			throw new Error('CausalEdge: self-referencing edge is not allowed');
		}
		const contribution = params.contribution ?? 1;
		if (contribution < 0 || contribution > 1) {
			throw new Error(`CausalEdge: contribution must be 0..1, got ${contribution}`);
		}
		return new CausalEdge(params.fromEventId, params.toEventId, contribution);
	}
}
