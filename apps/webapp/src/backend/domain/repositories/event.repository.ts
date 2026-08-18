import type { CausalEdgeSnapshot, EventSnapshot } from './simulation-run.repository';

/** Causal Graph / Event Timeline の描画に使う読み取り専用 Repository */
export interface EventRepository {
	findByRunId(runId: string): Promise<EventSnapshot[]>;
	findCausalEdgesByRunId(runId: string): Promise<CausalEdgeSnapshot[]>;
}
