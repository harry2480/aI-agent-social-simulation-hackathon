import type { DecisionSnapshot } from './simulation-run.repository';

/** Agent Detail の Last AI Decision 表示に使う読み取り専用 Repository */
export interface AgentDecisionRepository {
	findByRunId(runId: string, limit: number): Promise<DecisionSnapshot[]>;
}
