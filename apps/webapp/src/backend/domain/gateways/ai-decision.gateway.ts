/** AI へ渡す判断材料。都市全体の状態は含めない（要件定義 15 章の System Prompt に対応） */
export interface DecisionContext {
	agent: {
		role: string;
		fatigue: number;
		sleepDebt: number;
		responsibility: number;
		riskTolerance: number;
	};
	situation: Record<string, number>;
	/** 選択可能な action。AI はこの中からのみ選べる */
	actions: readonly string[];
}

export interface DecisionResult {
	action: string;
	reason: string;
	model: string;
}

/**
 * Agent の意味的な意思決定のみを担当する Gateway。
 * 事故発生・移動時間・渋滞計算・Sleep Debt・Fatigue 計算・確率計算は Simulation Engine の責務であり、
 * この Gateway では扱わない。
 */
export interface AiDecisionGateway {
	decide(context: DecisionContext): Promise<DecisionResult>;
}
