import {
	type DecisionContext,
	createDecideAgentActionUseCase,
} from '@/backend/presentation/composition/decision.composition';
import { NextResponse } from 'next/server';

/**
 * Watch Mode のブラウザ実行から呼ばれる AI Decision エンドポイント。
 * OPENROUTER_API_KEY をクライアントへ露出させないための境界であり、
 * Route Handler 自体はロジックを持たず composition から UseCase を取得して呼ぶだけとする。
 */
const useCase = createDecideAgentActionUseCase();

function isDecisionContext(value: unknown): value is DecisionContext {
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

export async function POST(request: Request): Promise<NextResponse> {
	const body: unknown = await request.json();
	if (!isDecisionContext(body)) {
		return NextResponse.json({ error: 'invalid decision context' }, { status: 400 });
	}

	const result = await useCase.decide(body);
	return NextResponse.json(result);
}
