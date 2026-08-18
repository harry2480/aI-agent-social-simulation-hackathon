import { Agent, type AgentRole } from '../models/agent.model';
import type { City } from '../models/city.model';
import type { ExperimentConfig } from '../models/experiment-config.model';
import type { SeededRandomService } from './seeded-random.service';

export type RelationshipKind = 'family' | 'manager_of' | 'colleague';

export interface AgentRelationship {
	fromAgentId: string;
	toAgentId: string;
	kind: RelationshipKind;
}

/** 標準 Population 300 人時の職種構成比（要件定義 6 章） */
const ROLE_RATIOS: ReadonlyArray<{ role: AgentRole; ratio: number }> = [
	{ role: 'office_worker', ratio: 150 / 300 },
	{ role: 'manager', ratio: 20 / 300 },
	{ role: 'driver', ratio: 35 / 300 },
	{ role: 'delivery_worker', ratio: 35 / 300 },
	{ role: 'store_worker', ratio: 30 / 300 },
];

/**
 * Population と Network（家族・上司部下・同僚）を生成する。
 * Seed が同じなら同じ Population・同じ Network になる。
 */
export class PopulationService {
	generate(
		config: ExperimentConfig,
		city: City,
		rng: SeededRandomService,
	): { agents: Agent[]; relationships: AgentRelationship[] } {
		const roles = this.buildRoleList(config.population);
		const homes = city.facilitiesOfType('home');
		const workplaces = city.facilitiesOfType('workplace');
		const stores = city.facilitiesOfType('store');
		const hubs = city.facilitiesOfType('logistics_hub');

		const agents: Agent[] = [];
		for (let i = 0; i < roles.length; i++) {
			const role = roles[i] as AgentRole;
			const home = homes[i % homes.length];
			if (home === undefined) {
				throw new Error('PopulationService: city has no home facility');
			}
			agents.push(
				Agent.create({
					id: this.agentId(i),
					role,
					homeId: home.id,
					workplaceId: this.workplaceFor(role, i, workplaces, stores, hubs),
					rng,
					thresholds: config.sleepStateThresholds,
				}),
			);
		}

		return { agents, relationships: this.buildRelationships(agents, rng) };
	}

	/** ID は昇順ソートしたときに生成順と一致するようゼロ埋めする */
	agentId(index: number): string {
		return `agent-${String(index).padStart(4, '0')}`;
	}

	private buildRoleList(population: number): AgentRole[] {
		const roles: AgentRole[] = [];
		for (const { role, ratio } of ROLE_RATIOS) {
			const count = Math.round(population * ratio);
			for (let i = 0; i < count; i++) {
				roles.push(role);
			}
		}
		// 端数調整。丸め誤差は office_worker で吸収する
		while (roles.length < population) {
			roles.push('office_worker');
		}
		return roles.slice(0, population);
	}

	private workplaceFor(
		role: AgentRole,
		index: number,
		workplaces: readonly { id: string }[],
		stores: readonly { id: string }[],
		hubs: readonly { id: string }[],
	): string | undefined {
		const pickFrom = (pool: readonly { id: string }[]): string | undefined =>
			pool.length === 0 ? undefined : pool[index % pool.length]?.id;

		switch (role) {
			case 'office_worker':
			case 'manager':
				return pickFrom(workplaces);
			case 'store_worker':
				return pickFrom(stores);
			case 'driver':
			case 'delivery_worker':
				return pickFrom(hubs);
		}
	}

	/**
	 * 3 種の Network を張る。
	 * - family: 同一 Home の Agent 同士（Household Network）
	 * - manager_of: 同一 Workplace の Manager → Office Worker（Work Network）
	 * - colleague: 同一 Workplace の Agent 同士（Work Network）
	 */
	private buildRelationships(
		agents: readonly Agent[],
		rng: SeededRandomService,
	): AgentRelationship[] {
		const relationships: AgentRelationship[] = [];

		const byHome = new Map<string, Agent[]>();
		const byWorkplace = new Map<string, Agent[]>();
		for (const agent of agents) {
			const homeGroup = byHome.get(agent.homeId) ?? [];
			homeGroup.push(agent);
			byHome.set(agent.homeId, homeGroup);

			if (agent.workplaceId !== undefined) {
				const workGroup = byWorkplace.get(agent.workplaceId) ?? [];
				workGroup.push(agent);
				byWorkplace.set(agent.workplaceId, workGroup);
			}
		}

		for (const members of [...byHome.values()]) {
			for (let i = 0; i < members.length; i++) {
				for (let j = i + 1; j < members.length; j++) {
					const a = members[i] as Agent;
					const b = members[j] as Agent;
					relationships.push({ fromAgentId: a.id, toAgentId: b.id, kind: 'family' });
					relationships.push({ fromAgentId: b.id, toAgentId: a.id, kind: 'family' });
				}
			}
		}

		for (const members of [...byWorkplace.values()]) {
			const managers = members.filter((member) => member.role === 'manager');
			const subordinates = members.filter((member) => member.role !== 'manager');
			for (const subordinate of subordinates) {
				if (managers.length === 0) {
					continue;
				}
				const manager = rng.pick(managers);
				relationships.push({
					fromAgentId: manager.id,
					toAgentId: subordinate.id,
					kind: 'manager_of',
				});
			}
			for (let i = 0; i < members.length; i++) {
				for (let j = i + 1; j < members.length; j++) {
					const a = members[i] as Agent;
					const b = members[j] as Agent;
					relationships.push({ fromAgentId: a.id, toAgentId: b.id, kind: 'colleague' });
				}
			}
		}

		return relationships;
	}
}
