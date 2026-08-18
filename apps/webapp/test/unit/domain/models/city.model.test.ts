import { City, DEFAULT_CITY_LAYOUT } from '@/backend/domain/models/city.model';
import { SeededRandomService } from '@/backend/domain/services/seeded-random.service';
import { describe, expect, it } from 'vitest';

function buildCity(seed = 42): City {
	return City.generate(DEFAULT_CITY_LAYOUT, new SeededRandomService(seed));
}

describe('City', () => {
	it('要件どおりの地区構成を生成する', () => {
		const city = buildCity();
		const count = (type: string) =>
			city.districts.filter((district) => district.type === type).length;

		expect(count('residential')).toBe(3);
		expect(count('office')).toBe(2);
		expect(count('commercial')).toBe(1);
		expect(count('logistics')).toBe(1);
	});

	it('道路数が要件の 20〜40 本に収まる', () => {
		expect(buildCity().roads.length).toBeGreaterThanOrEqual(20);
		expect(buildCity().roads.length).toBeLessThanOrEqual(40);
	});

	it('同じ Seed なら同じ都市を生成する', () => {
		expect(buildCity(7).facilities).toEqual(buildCity(7).facilities);
	});

	it('施設種別ごとに取得できる', () => {
		const city = buildCity();
		expect(city.facilitiesOfType('home')).toHaveLength(3 * 40);
		expect(city.facilitiesOfType('workplace')).toHaveLength(2 * 6);
		expect(city.facilitiesOfType('logistics_hub')).toHaveLength(1);
	});

	it('存在しない施設を参照すると例外を投げる', () => {
		expect(() => buildCity().facility('unknown')).toThrow(/unknown facility/);
	});

	describe('roadBetween', () => {
		it('地区が異なれば道路を返す', () => {
			const city = buildCity();
			const home = city.facilitiesOfType('home')[0];
			const workplace = city.facilitiesOfType('workplace')[0];
			expect(city.roadBetween(home?.id ?? '', workplace?.id ?? '')).toBeDefined();
		});

		it('同一地区内の移動では道路を使わない', () => {
			const city = buildCity();
			const homes = city.facilitiesOfType('home');
			const [first, second] = homes;
			expect(first?.districtId).toBe(second?.districtId);
			expect(city.roadBetween(first?.id ?? '', second?.id ?? '')).toBeUndefined();
		});

		it('方向を入れ替えても同じ道路を返す', () => {
			const city = buildCity();
			const home = city.facilitiesOfType('home')[0]?.id ?? '';
			const workplace = city.facilitiesOfType('workplace')[0]?.id ?? '';
			expect(city.roadBetween(home, workplace)).toEqual(city.roadBetween(workplace, home));
		});
	});

	describe('travelMinutes', () => {
		it('混雑分だけ移動時間が増える', () => {
			const city = buildCity();
			const home = city.facilitiesOfType('home')[0]?.id ?? '';
			const workplace = city.facilitiesOfType('workplace')[0]?.id ?? '';

			const base = city.travelMinutes(home, workplace, 0);
			expect(city.travelMinutes(home, workplace, 25)).toBe(base + 25);
		});

		it('負の混雑は移動時間を短くしない', () => {
			const city = buildCity();
			const home = city.facilitiesOfType('home')[0]?.id ?? '';
			const workplace = city.facilitiesOfType('workplace')[0]?.id ?? '';

			const base = city.travelMinutes(home, workplace, 0);
			expect(city.travelMinutes(home, workplace, -100)).toBe(base);
		});

		it('同一地区内の移動は既定の 5 分', () => {
			const city = buildCity();
			const homes = city.facilitiesOfType('home');
			expect(city.travelMinutes(homes[0]?.id ?? '', homes[1]?.id ?? '', 30)).toBe(5);
		});
	});
});
