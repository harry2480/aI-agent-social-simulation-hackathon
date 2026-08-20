import { City, type Road } from '@/backend/domain/models/city.model';
import { SimulationClock } from '@/backend/domain/models/simulation-clock.model';
import { SimulationState } from '@/backend/domain/models/simulation-state.model';
import { SeededRandomService } from '@/backend/domain/services/seeded-random.service';
import { TrafficService } from '@/backend/domain/services/traffic.service';
import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../../helpers/experiment-config';

const service = new TrafficService();

/**
 * 地区 4 つの都市を持つ State。
 * 地区が 3 つ以下だと全道路が互いに接続してしまい、
 * 「接続していない道路には波及しない」ことを確認できない。
 */
function buildState(): SimulationState {
	const config = createTestConfig({
		seed: 1,
		population: 1,
		days: 1,
		initialSleepDeprivedRate: 0,
		cityLayout: {
			residentialDistricts: 2,
			officeDistricts: 2,
			commercialDistricts: 0,
			logisticsDistricts: 0,
			homesPerResidentialDistrict: 1,
			workplacesPerOfficeDistrict: 1,
			storesPerCommercialDistrict: 0,
		},
	});
	const city = City.generate(config.cityLayout, new SeededRandomService(1));
	return new SimulationState(config, city, [], SimulationClock.start());
}

/** 2 地区を結ぶ道路を取り出す */
function roadOf(state: SimulationState, from: string, to: string): Road {
	const road = state.city.roads.find(
		(candidate) => candidate.fromDistrictId === from && candidate.toDistrictId === to,
	);
	if (road === undefined) {
		throw new Error(`test setup: road ${from} -> ${to} not found`);
	}
	return road;
}

describe('TrafficService.addCongestion', () => {
	it('未混雑の道路には原因 Event ごと新規登録する', () => {
		const state = buildState();

		service.addCongestion(state, 'road-a', 25, 'e1');

		expect(state.congestions.get('road-a')).toEqual({
			roadId: 'road-a',
			extraMinutes: 25,
			causedByEventId: 'e1',
		});
	});

	it('混雑は累積する', () => {
		const state = buildState();

		service.addCongestion(state, 'road-a', 25, 'e1');
		service.addCongestion(state, 'road-a', 10, 'e2');

		expect(state.congestions.get('road-a')?.extraMinutes).toBe(35);
	});

	it('より強い混雑を持ち込んだ Event が原因として支配的になる', () => {
		// 遅延を受けた Agent の Event がこの ID を参照して因果が確定するため、
		// どちらを原因とするかで Causal Graph の形が変わる
		const state = buildState();

		service.addCongestion(state, 'road-a', 10, 'e1');
		service.addCongestion(state, 'road-a', 30, 'e2');

		expect(state.congestions.get('road-a')?.causedByEventId).toBe('e2');
	});

	it('後から弱い混雑が来ても原因は入れ替わらない', () => {
		const state = buildState();

		service.addCongestion(state, 'road-a', 30, 'e1');
		service.addCongestion(state, 'road-a', 10, 'e2');

		expect(state.congestions.get('road-a')?.causedByEventId).toBe('e1');
	});
});

describe('TrafficService.addAccidentCongestion', () => {
	it('事故道路には全量、接続する道路には 20% を波及させる', () => {
		const state = buildState();
		const accidentRoad = roadOf(state, 'residential-0', 'residential-1');

		const affected = service.addAccidentCongestion(state, accidentRoad, 25, 'e1');

		expect(state.congestions.get(accidentRoad.id)?.extraMinutes).toBe(25);
		for (const road of affected.filter((candidate) => candidate.id !== accidentRoad.id)) {
			expect(state.congestions.get(road.id)?.extraMinutes).toBe(5);
		}
	});

	it('地区を共有しない道路には波及しない', () => {
		// 波及を強くすると全道路が常時渋滞になり、どこが詰まっているかの情報が失われる
		const state = buildState();
		const accidentRoad = roadOf(state, 'residential-0', 'residential-1');
		const disjointRoad = roadOf(state, 'office-0', 'office-1');

		const affected = service.addAccidentCongestion(state, accidentRoad, 25, 'e1');

		expect(affected.map((road) => road.id)).not.toContain(disjointRoad.id);
		expect(state.congestions.has(disjointRoad.id)).toBe(false);
	});

	it('返す道路の先頭は事故が起きた道路そのもの', () => {
		const state = buildState();
		const accidentRoad = roadOf(state, 'residential-0', 'residential-1');

		const affected = service.addAccidentCongestion(state, accidentRoad, 25, 'e1');

		expect(affected[0]?.id).toBe(accidentRoad.id);
	});

	it('波及分の原因 Event も事故 Event になる', () => {
		const state = buildState();
		const accidentRoad = roadOf(state, 'residential-0', 'residential-1');

		const affected = service.addAccidentCongestion(state, accidentRoad, 25, 'accident-1');

		for (const road of affected) {
			expect(state.congestions.get(road.id)?.causedByEventId).toBe('accident-1');
		}
	});
});

describe('TrafficService.congestionOn', () => {
	it('道路 ID が未指定なら undefined を返す', () => {
		const state = buildState();

		expect(service.congestionOn(state, undefined)).toBeUndefined();
	});

	it('混雑していない道路も undefined を返す', () => {
		const state = buildState();

		expect(service.congestionOn(state, 'road-a')).toBeUndefined();
	});
});

describe('TrafficService.decay', () => {
	it('1 Tick ごとに 2 分ずつ解消する', () => {
		const state = buildState();
		service.addCongestion(state, 'road-a', 25, 'e1');

		service.decay(state);

		expect(state.congestions.get('road-a')?.extraMinutes).toBe(23);
	});

	it('原因 Event は解消の過程で保たれる', () => {
		const state = buildState();
		service.addCongestion(state, 'road-a', 25, 'e1');

		service.decay(state);

		expect(state.congestions.get('road-a')?.causedByEventId).toBe('e1');
	});

	it('残りが 0 以下になった道路はエントリごと削除する', () => {
		const state = buildState();
		service.addCongestion(state, 'road-a', 2, 'e1');

		service.decay(state);

		expect(state.congestions.has('road-a')).toBe(false);
	});

	it('25 分の混雑は約 3 時間で解消する', () => {
		// 事故由来の渋滞が数時間規模で残ることが、通勤時間帯への波及の前提になる
		const state = buildState();
		service.addCongestion(state, 'road-a', 25, 'e1');

		let ticks = 0;
		while (state.congestions.has('road-a')) {
			service.decay(state);
			ticks += 1;
		}

		// 13 Tick = 3 時間 15 分
		expect(ticks).toBe(13);
	});
});
