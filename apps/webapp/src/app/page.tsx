import { resolveAiModelName } from '@/backend/presentation/composition/decision.composition';
import { loadRunForReplay } from '@/backend/presentation/loaders/simulation.loader';
import {
	type ReplaySource,
	SimulationDashboard,
} from '@/frontend/components/simulation/simulation-dashboard';
import { parseReplayParams, replayLabel } from '@/frontend/lib/replay-presentation';

/** Replay 指定時は保存済み Run を読むため、ビルド時に固定しない */
export const dynamic = 'force-dynamic';

interface SimulationPageProps {
	searchParams: Promise<{ replay?: string }>;
}

export default async function SimulationPage({ searchParams }: SimulationPageProps) {
	const { replay: runId } = await searchParams;
	const replay = runId === undefined ? undefined : await buildReplaySource(runId);

	return <SimulationDashboard replay={replay} />;
}

/**
 * 保存された Run を Replay 用の条件へ変換する。
 * Run が見つからない・Config が読めない場合は通常の Watch Mode として開く。
 */
async function buildReplaySource(runId: string): Promise<ReplaySource | undefined> {
	const run = await loadRunForReplay(runId);
	if (run === null) {
		return undefined;
	}
	const params = parseReplayParams(run.config);
	if (params === null) {
		return undefined;
	}
	return {
		runId: run.id,
		label: replayLabel(params),
		params,
		savedAiModel: run.aiModel ?? params.aiModel ?? null,
		// AI Model はクライアントに選ばせず、サーバーの設定に従う（コストとキー保護のため）
		currentAiModel: resolveAiModelName(),
	};
}
