import { Agent, type AgentActionName, type AgentRole } from '@/backend/domain/models/agent.model';

interface TestAgentOverrides {
	id?: string;
	role?: AgentRole;
	homeId?: string;
	workplaceId?: string;
	sleepNeedHours?: number;
	responsibility?: number;
	riskTolerance?: number;
	cooperativeness?: number;
	familyResponsibility?: number;
	currentLocationId?: string;
	sleepDebtHours?: number;
	fatigue?: number;
	stress?: number;
	workPressure?: number;
	currentAction?: AgentActionName;
	sleepMinutesThisNight?: number;
}

/**
 * 属性を固定した Agent を作る。
 *
 * Agent.create は乱数から属性を引くため、閾値や倍率そのものを検証するテストでは
 * 値を直接指定できる reconstruct を使う。指定しなかった属性は
 * 判定に影響しない中庸な値（Sleep Debt 0・Fatigue 0・Stress 0）になる。
 */
export function createTestAgent(overrides: TestAgentOverrides = {}): Agent {
	return Agent.reconstruct({
		id: overrides.id ?? 'agent-0000',
		role: overrides.role ?? 'office_worker',
		homeId: overrides.homeId ?? 'home-0',
		workplaceId: overrides.workplaceId ?? 'workplace-0',
		sleepNeedHours: overrides.sleepNeedHours ?? 8,
		responsibility: overrides.responsibility ?? 0.5,
		riskTolerance: overrides.riskTolerance ?? 0.5,
		cooperativeness: overrides.cooperativeness ?? 0.5,
		familyResponsibility: overrides.familyResponsibility ?? 0.5,
		currentLocationId: overrides.currentLocationId ?? overrides.homeId ?? 'home-0',
		sleepDebtHours: overrides.sleepDebtHours ?? 0,
		fatigue: overrides.fatigue ?? 0,
		stress: overrides.stress ?? 0,
		workPressure: overrides.workPressure ?? 0.5,
		currentAction: overrides.currentAction ?? 'idle',
		sleepMinutesThisNight: overrides.sleepMinutesThisNight ?? 0,
		lastSleepStateName: 'normal',
	});
}
