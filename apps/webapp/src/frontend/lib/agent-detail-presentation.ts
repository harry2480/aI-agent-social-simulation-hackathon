import type {
	Agent,
	SleepTransmission,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import { formatNumber, formatRoleLabel } from '@/frontend/lib/format';

export interface AgentDetailRow {
	label: string;
	value: string;
}

/**
 * Agent 詳細の表示行を組み立てる。
 * 桁数は項目ごとに変える。Sleep Debt は伝播の判定に効くため 2 桁、
 * Fatigue / Stress は 0〜100 の目安なので整数で足りる。
 */
/** 初日の未明はまだ 1 晩も明けておらず、0 h と書くと「一睡もしなかった」と読めるため区別する */
function formatLastSleep(hours: number | null): string {
	return hours === null ? '-' : `${formatNumber(hours, 1)} h`;
}

export function agentDetailRows(agent: Agent, generation: number | undefined): AgentDetailRow[] {
	return [
		{ label: 'Role', value: formatRoleLabel(agent.role) },
		{ label: 'Current Location', value: agent.currentLocationId },
		{ label: 'Current Action', value: agent.currentAction },
		{ label: 'Sleep Need', value: `${formatNumber(agent.sleepNeedHours, 1)} h` },
		{ label: 'Last Sleep', value: formatLastSleep(agent.lastSleepHours) },
		{ label: 'Sleep Debt', value: `${formatNumber(agent.sleepDebtHours, 2)} h` },
		{ label: 'Fatigue', value: formatNumber(agent.fatigue, 0) },
		{ label: 'Stress', value: formatNumber(agent.stress, 0) },
		{ label: 'Responsibility', value: formatNumber(agent.responsibility) },
		{ label: 'Risk Tolerance', value: formatNumber(agent.riskTolerance) },
		{ label: 'Work Pressure', value: formatNumber(agent.workPressure) },
		{ label: 'Cooperativeness', value: formatNumber(agent.cooperativeness) },
		{ label: 'Family Responsibility', value: formatNumber(agent.familyResponsibility) },
		{ label: 'Generation', value: generation === undefined ? '-' : String(generation) },
	];
}

/**
 * その Agent へ睡眠不足を渡した相手（親）と、渡した相手（子）を取り出す。
 * 伝播の向きを取り違えると因果の読み方が逆になるため、方向ごとに分ける。
 */
export function transmissionsOf(
	transmissions: readonly SleepTransmission[],
	agentId: string,
): { parentIds: string[]; childIds: string[] } {
	const parentIds: string[] = [];
	const childIds: string[] = [];

	for (const transmission of transmissions) {
		if (transmission.toAgentId === agentId) {
			parentIds.push(transmission.fromAgentId);
		}
		if (transmission.fromAgentId === agentId) {
			childIds.push(transmission.toAgentId);
		}
	}

	return { parentIds, childIds };
}

/** Agent ID の一覧。1 件も無ければ - を出し、空欄と区別する */
export function formatAgentIdList(agentIds: readonly string[]): string {
	return agentIds.length === 0 ? '-' : agentIds.join(', ');
}
