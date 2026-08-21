import type { Agent } from '@/backend/domain/models/agent.model';
import { City } from '@/backend/domain/models/city.model';
import type { ExperimentConfig } from '@/backend/domain/models/experiment-config.model';
import { PopulationService } from '@/backend/domain/services/population.service';
import { SeededRandomService } from '@/backend/domain/services/seeded-random.service';
import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../../helpers/experiment-config';

const service = new PopulationService();

const CITY_LAYOUT = {
	residentialDistricts: 2,
	officeDistricts: 1,
	commercialDistricts: 1,
	logisticsDistricts: 1,
	homesPerResidentialDistrict: 5,
	workplacesPerOfficeDistrict: 2,
	storesPerCommercialDistrict: 2,
};

function configFor(population: number): ExperimentConfig {
	return createTestConfig({
		seed: 1,
		population,
		days: 1,
		initialSleepDeprivedRate: 0,
		cityLayout: CITY_LAYOUT,
	});
}

function generate(population: number, seed = 1) {
	const config = configFor(population);
	const city = City.generate(config.cityLayout, new SeededRandomService(seed));
	return service.generate(config, city, new SeededRandomService(seed));
}

describe('PopulationService.agentId', () => {
	it('ID 昇順でソートすると生成順と一致するようゼロ埋めする', () => {
		// この一致が崩れると orderedAgents の並びが変わり、再現性が失われる
		const ids = [0, 9, 10, 100, 1000].map((index) => service.agentId(index));

		expect(ids).toEqual(['agent-0000', 'agent-0009', 'agent-0010', 'agent-0100', 'agent-1000']);
		expect([...ids].sort()).toEqual(ids);
	});
});

describe('PopulationService.generate', () => {
	it('指定した Population 数ぴったりの Agent を作る', () => {
		expect(generate(20).agents).toHaveLength(20);
		expect(generate(7).agents).toHaveLength(7);
		expect(generate(1).agents).toHaveLength(1);
	});

	it('職種構成比に従って割り当て、丸め誤差は office_worker で吸収する', () => {
		const { agents } = generate(20);
		const countOf = (role: string) => agents.filter((agent) => agent.role === role).length;

		// 20 人では office 10 / manager 1 / driver 2 / delivery 2 / store 2 = 17 人にしかならず、
		// 残り 3 人は office_worker として補われる
		expect(countOf('manager')).toBe(1);
		expect(countOf('driver')).toBe(2);
		expect(countOf('delivery_worker')).toBe(2);
		expect(countOf('store_worker')).toBe(2);
		expect(countOf('office_worker')).toBe(13);
	});

	it('Population が極端に小さくても構成比の切り捨てで人数が不足しない', () => {
		// 構成比だけでは 0 人になる職種が出るため、端数調整が効かないと Population を満たせない
		const { agents } = generate(3);

		expect(agents).toHaveLength(3);
		expect(agents.every((agent) => agent.role === 'office_worker')).toBe(true);
	});

	it('職種に応じた勤務先を割り当てる', () => {
		const { agents } = generate(20);
		const workplaceOf = (role: string) =>
			agents.find((agent) => agent.role === role)?.workplaceId ?? '';

		expect(workplaceOf('office_worker')).toContain('workplace-');
		expect(workplaceOf('manager')).toContain('workplace-');
		expect(workplaceOf('store_worker')).toContain('store-');
		expect(workplaceOf('driver')).toContain('logistics_hub-');
		expect(workplaceOf('delivery_worker')).toContain('logistics_hub-');
	});

	it('同じ Seed なら同じ Population と Network になる', () => {
		// ID・職種・自宅だけを比べると、RNG の消費順が変わって性格や必要睡眠時間が
		// ずれても気づけない。再現性の要はむしろそちらなので属性ごと比較する
		const snapshot = (agents: readonly Agent[]) =>
			agents.map((agent) => ({
				id: agent.id,
				role: agent.role,
				homeId: agent.homeId,
				workplaceId: agent.workplaceId,
				sleepNeedHours: agent.sleepNeedHours,
				responsibility: agent.responsibility,
				riskTolerance: agent.riskTolerance,
				cooperativeness: agent.cooperativeness,
				familyResponsibility: agent.familyResponsibility,
				sleepDebtHours: agent.sleepDebtHours,
				fatigue: agent.fatigue,
				workPressure: agent.workPressure,
			}));
		const first = generate(20);
		const second = generate(20);

		expect(snapshot(first.agents)).toEqual(snapshot(second.agents));
		expect(first.relationships).toEqual(second.relationships);
	});

	it('Seed が違えば Agent の属性も変わる', () => {
		// 上の比較が「常に同じ値」を見ているだけでないことを確かめる
		const first = generate(20, 1);
		const other = generate(20, 2);

		expect(first.agents[0]?.sleepNeedHours).not.toBe(other.agents[0]?.sleepNeedHours);
	});

	it('同居する Agent 同士に双方向の family 関係を張る', () => {
		// Household Network は双方向でないと、片側からしか伝播しなくなる
		const { relationships } = generate(20);
		const families = relationships.filter((relationship) => relationship.kind === 'family');

		expect(families.length).toBeGreaterThan(0);
		for (const family of families) {
			expect(families).toContainEqual({
				fromAgentId: family.toAgentId,
				toAgentId: family.fromAgentId,
				kind: 'family',
			});
		}
	});

	it('manager_of は Manager から同じ勤務先の部下へ張る', () => {
		const { agents, relationships } = generate(20);
		const byId = new Map(agents.map((agent) => [agent.id, agent]));
		const managerOf = relationships.filter((relationship) => relationship.kind === 'manager_of');

		expect(managerOf.length).toBeGreaterThan(0);
		for (const relationship of managerOf) {
			const manager = byId.get(relationship.fromAgentId);
			const subordinate = byId.get(relationship.toAgentId);
			expect(manager?.role).toBe('manager');
			expect(subordinate?.role).not.toBe('manager');
			expect(manager?.workplaceId).toBe(subordinate?.workplaceId);
		}
	});

	it('Manager が居ない勤務先の Agent には上司が付かない', () => {
		// 20 人中 Manager は 1 人だけなので、もう一方の勤務先には上司が居ない
		const { agents, relationships } = generate(20);
		const manager = agents.find((agent) => agent.role === 'manager');
		const managed = new Set(
			relationships
				.filter((relationship) => relationship.kind === 'manager_of')
				.map((relationship) => relationship.toAgentId),
		);
		const otherWorkplace = agents.filter(
			(agent) =>
				agent.workplaceId?.includes('workplace-') === true &&
				agent.workplaceId !== manager?.workplaceId,
		);

		expect(otherWorkplace.length).toBeGreaterThan(0);
		expect(otherWorkplace.some((agent) => managed.has(agent.id))).toBe(false);
	});

	it('勤務先を持たない Agent は colleague 関係を持たない', () => {
		// 既定の都市には全職種ぶんの施設があるため、そのままでは
		// 勤務先なしの Agent が 1 人も出ず、この検証が空回りする。
		// 店舗と物流拠点が無い都市にして、実際に勤務先なしを作る
		const config = createTestConfig({
			seed: 1,
			population: 20,
			days: 1,
			initialSleepDeprivedRate: 0,
			cityLayout: { ...CITY_LAYOUT, commercialDistricts: 0, logisticsDistricts: 0 },
		});
		const city = City.generate(config.cityLayout, new SeededRandomService(1));
		const { agents, relationships } = service.generate(config, city, new SeededRandomService(1));

		const withoutWorkplace = agents.filter((agent) => agent.workplaceId === undefined);
		const colleagues = relationships.filter((relationship) => relationship.kind === 'colleague');

		expect(withoutWorkplace.length).toBeGreaterThan(0);
		for (const agent of withoutWorkplace) {
			expect(
				colleagues.some(
					(relationship) =>
						relationship.fromAgentId === agent.id || relationship.toAgentId === agent.id,
				),
			).toBe(false);
		}
	});

	it('Home が無い都市では生成に失敗する', () => {
		const config = createTestConfig({
			seed: 1,
			population: 5,
			days: 1,
			initialSleepDeprivedRate: 0,
			cityLayout: { ...CITY_LAYOUT, residentialDistricts: 0 },
		});
		const city = City.generate(config.cityLayout, new SeededRandomService(1));

		expect(() => service.generate(config, city, new SeededRandomService(1))).toThrow(
			'city has no home facility',
		);
	});
});
