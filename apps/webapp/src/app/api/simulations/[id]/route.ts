import { isDatabaseConfigured } from '@/backend/presentation/composition/simulation.composition';
import { loadRunDetail, loadRunForReplay } from '@/backend/presentation/loaders/simulation.loader';
import { NextResponse } from 'next/server';
import { parseRunDetailLevel } from '../request';

/**
 * 保存済み Run の取得エンドポイント（要件定義 41 章）。
 * 既定は Run のメタ情報と集計サマリのみを返し、`?detail=full` で明細まで返す。
 */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
	const level = parseRunDetailLevel(new URL(request.url).searchParams.get('detail'));
	if (level === null) {
		return NextResponse.json({ error: 'invalid detail; use summary | full' }, { status: 400 });
	}

	if (!isDatabaseConfigured()) {
		return NextResponse.json({ error: 'database is not configured' }, { status: 503 });
	}

	const { id } = await params;
	if (level === 'full') {
		const detail = await loadRunDetail(id);
		return detail === null
			? NextResponse.json({ error: 'run not found' }, { status: 404 })
			: NextResponse.json(detail);
	}

	const run = await loadRunForReplay(id);
	return run === null
		? NextResponse.json({ error: 'run not found' }, { status: 404 })
		: NextResponse.json({ run });
}
