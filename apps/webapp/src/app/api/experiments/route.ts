import { createExperimentAction } from '@/backend/presentation/actions/experiment.action';
import { isDatabaseConfigured } from '@/backend/presentation/composition/simulation.composition';
import { NextResponse } from 'next/server';
import { readJsonBody } from '../json-body';
import { isCreateExperimentInput } from './request';

/**
 * 実験の登録エンドポイント（要件定義 41 章）。
 *
 * 登録のみを行い、実行はここでは行わない。
 * Multi-seed / Sweep / Super-spreader Stage 1 は Vercel Function の実行時間上限に当たるため、
 * ローカルの `scripts/run-experiment.ts` が実行し、結果を `experiment_results` へ保存する。
 */
export async function POST(request: Request): Promise<NextResponse> {
	const body = await readJsonBody(request);
	if (!isCreateExperimentInput(body)) {
		return NextResponse.json({ error: 'invalid experiment input' }, { status: 400 });
	}

	if (!isDatabaseConfigured()) {
		return NextResponse.json({ error: 'database is not configured' }, { status: 503 });
	}

	const result = await createExperimentAction(body);
	return NextResponse.json(result, { status: 201 });
}
