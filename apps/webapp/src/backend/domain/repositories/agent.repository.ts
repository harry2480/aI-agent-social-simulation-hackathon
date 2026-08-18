import type { AgentSnapshot } from './simulation-run.repository';

/** Agent Detail / Super-spreader ランキングに使う読み取り専用 Repository */
export interface AgentRepository {
	findByRunId(runId: string): Promise<AgentSnapshot[]>;
}
