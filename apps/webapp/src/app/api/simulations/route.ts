import {
	type CreateSimulationInput,
	runSimulationAction,
} from '@/backend/presentation/actions/simulation.action';
import { loadRecentRuns } from '@/backend/presentation/loaders/simulation.loader';
import { NextResponse } from 'next/server';

/**
 * 外部スクリプト / Batch Runner からの Simulation 実行エンドポイント（要件定義 41 章）。
 *
 * 重い Batch（Multi-seed / Sweep）はここで完走させない。
 * Vercel Function の実行時間上限に当たるため、大量実行はローカルの
 * `scripts/run-experiment.ts` が担い、このエンドポイントは小規模な単発 Run に限る。
 */
const MAX_SYNCHRONOUS_TICKS = 300 * 96;

function isCreateSimulationInput(value: unknown): value is CreateSimulationInput {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as Partial<CreateSimulationInput>;
	return (
		typeof candidate.seed === 'number' &&
		typeof candidate.population === 'number' &&
		typeof candidate.days === 'number' &&
		typeof candidate.initialSleepDeprivedRate === 'number'
	);
}

export async function GET(): Promise<NextResponse> {
	return NextResponse.json({ runs: await loadRecentRuns(20) });
}

export async function POST(request: Request): Promise<NextResponse> {
	const body: unknown = await request.json();
	if (!isCreateSimulationInput(body)) {
		return NextResponse.json({ error: 'invalid simulation input' }, { status: 400 });
	}

	if (body.population * body.days * 96 > MAX_SYNCHRONOUS_TICKS * 7) {
		return NextResponse.json(
			{ error: 'run too large for synchronous execution; use scripts/run-experiment.ts' },
			{ status: 413 },
		);
	}

	try {
		const result = await runSimulationAction(body);
		return NextResponse.json(result, { status: 201 });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'simulation failed' },
			{ status: 400 },
		);
	}
}
