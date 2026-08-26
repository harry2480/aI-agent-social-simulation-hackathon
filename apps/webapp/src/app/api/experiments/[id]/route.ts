import { isDatabaseConfigured } from '@/backend/presentation/composition/simulation.composition';
import { loadExperimentDetail } from '@/backend/presentation/loaders/experiment.loader';
import { NextResponse } from 'next/server';

/**
 * 実験結果の取得エンドポイント（要件定義 41 章）。
 * 集計結果（`results`）と、その実験に紐づく Run 一覧を返す。
 */
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
	if (!isDatabaseConfigured()) {
		return NextResponse.json({ error: 'database is not configured' }, { status: 503 });
	}

	const { id } = await params;
	const detail = await loadExperimentDetail(id);
	if (detail === null) {
		return NextResponse.json({ error: 'experiment not found' }, { status: 404 });
	}

	return NextResponse.json(detail);
}
