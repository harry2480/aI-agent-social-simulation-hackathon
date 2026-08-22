import { createDecideAgentActionUseCase } from '@/backend/presentation/composition/decision.composition';
import { NextResponse } from 'next/server';
import { isDecisionContext } from './request';

/**
 * Watch Mode のブラウザ実行から呼ばれる AI Decision エンドポイント。
 * OPENROUTER_API_KEY をクライアントへ露出させないための境界であり、
 * Route Handler 自体はロジックを持たず composition から UseCase を取得して呼ぶだけとする。
 */
const useCase = createDecideAgentActionUseCase();

export async function POST(request: Request): Promise<NextResponse> {
	const body: unknown = await request.json();
	if (!isDecisionContext(body)) {
		return NextResponse.json({ error: 'invalid decision context' }, { status: 400 });
	}

	const result = await useCase.decide(body);
	return NextResponse.json(result);
}
