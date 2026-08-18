import type { SeededRandomService } from '../services/seeded-random.service';

export type DistrictType = 'residential' | 'office' | 'commercial' | 'logistics';
export type FacilityType = 'home' | 'workplace' | 'store' | 'logistics_hub';

export interface District {
	id: string;
	type: DistrictType;
	x: number;
	y: number;
}

export interface Facility {
	id: string;
	type: FacilityType;
	districtId: string;
	x: number;
	y: number;
}

export interface Road {
	id: string;
	fromDistrictId: string;
	toDistrictId: string;
	baseTravelMinutes: number;
}

export interface CityLayoutConfig {
	residentialDistricts: number;
	officeDistricts: number;
	commercialDistricts: number;
	logisticsDistricts: number;
	homesPerResidentialDistrict: number;
	workplacesPerOfficeDistrict: number;
	storesPerCommercialDistrict: number;
}

export const DEFAULT_CITY_LAYOUT: CityLayoutConfig = {
	residentialDistricts: 3,
	officeDistricts: 2,
	commercialDistricts: 1,
	logisticsDistricts: 1,
	homesPerResidentialDistrict: 40,
	workplacesPerOfficeDistrict: 6,
	storesPerCommercialDistrict: 4,
};

/**
 * 仮想都市。実在都市 GIS の再現は行わず、Sleep Cascade の観測に適した架空都市を生成する。
 * 道路は地区間を結び、Agent の移動時間は道路の混雑度に応じて増加する。
 */
export class City {
	private constructor(
		public readonly districts: readonly District[],
		public readonly facilities: readonly Facility[],
		public readonly roads: readonly Road[],
		private readonly facilityById: ReadonlyMap<string, Facility>,
		private readonly roadByDistrictPair: ReadonlyMap<string, Road>,
	) {}

	static generate(layout: CityLayoutConfig, rng: SeededRandomService): City {
		const districts: District[] = [];
		const facilities: Facility[] = [];

		const addDistrict = (type: DistrictType, index: number): District => {
			const district: District = {
				id: `${type}-${index}`,
				type,
				x: rng.nextFloat(0, 100),
				y: rng.nextFloat(0, 100),
			};
			districts.push(district);
			return district;
		};

		const addFacilities = (district: District, type: FacilityType, count: number): void => {
			for (let i = 0; i < count; i++) {
				facilities.push({
					id: `${type}-${district.id}-${i}`,
					type,
					districtId: district.id,
					x: district.x + rng.nextFloat(-5, 5),
					y: district.y + rng.nextFloat(-5, 5),
				});
			}
		};

		for (let i = 0; i < layout.residentialDistricts; i++) {
			addFacilities(addDistrict('residential', i), 'home', layout.homesPerResidentialDistrict);
		}
		for (let i = 0; i < layout.officeDistricts; i++) {
			addFacilities(addDistrict('office', i), 'workplace', layout.workplacesPerOfficeDistrict);
		}
		for (let i = 0; i < layout.commercialDistricts; i++) {
			addFacilities(addDistrict('commercial', i), 'store', layout.storesPerCommercialDistrict);
		}
		for (let i = 0; i < layout.logisticsDistricts; i++) {
			addFacilities(addDistrict('logistics', i), 'logistics_hub', 1);
		}

		// 全地区ペアを道路で結ぶ（地区数は 5〜7 程度のため全結合で 20〜40 本に収まる）
		const roads: Road[] = [];
		for (let i = 0; i < districts.length; i++) {
			for (let j = i + 1; j < districts.length; j++) {
				const from = districts[i] as District;
				const to = districts[j] as District;
				const distance = Math.hypot(from.x - to.x, from.y - to.y);
				roads.push({
					id: `road-${from.id}--${to.id}`,
					fromDistrictId: from.id,
					toDistrictId: to.id,
					// 距離 100 で約 60 分。最低 5 分
					baseTravelMinutes: Math.max(5, Math.round(distance * 0.6)),
				});
			}
		}

		const facilityById = new Map(facilities.map((facility) => [facility.id, facility]));
		const roadByDistrictPair = new Map<string, Road>();
		for (const road of roads) {
			roadByDistrictPair.set(City.pairKey(road.fromDistrictId, road.toDistrictId), road);
			roadByDistrictPair.set(City.pairKey(road.toDistrictId, road.fromDistrictId), road);
		}

		return new City(districts, facilities, roads, facilityById, roadByDistrictPair);
	}

	facility(facilityId: string): Facility {
		const facility = this.facilityById.get(facilityId);
		if (facility === undefined) {
			throw new Error(`City: unknown facility ${facilityId}`);
		}
		return facility;
	}

	facilitiesOfType(type: FacilityType): Facility[] {
		return this.facilities.filter((facility) => facility.type === type);
	}

	/** 2 施設間を結ぶ道路。同一地区内の移動では道路を使わない */
	roadBetween(fromFacilityId: string, toFacilityId: string): Road | undefined {
		const from = this.facility(fromFacilityId);
		const to = this.facility(toFacilityId);
		if (from.districtId === to.districtId) {
			return undefined;
		}
		return this.roadByDistrictPair.get(City.pairKey(from.districtId, to.districtId));
	}

	/** 混雑による追加遅延を加えた移動時間（分） */
	travelMinutes(fromFacilityId: string, toFacilityId: string, congestionMinutes: number): number {
		const road = this.roadBetween(fromFacilityId, toFacilityId);
		if (road === undefined) {
			return 5;
		}
		return road.baseTravelMinutes + Math.max(0, congestionMinutes);
	}

	private static pairKey(a: string, b: string): string {
		return `${a}::${b}`;
	}
}
