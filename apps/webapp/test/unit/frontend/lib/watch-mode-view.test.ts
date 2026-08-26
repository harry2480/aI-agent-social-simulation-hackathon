import { City } from '@/backend/domain/models/city.model';
import { SimulationClock } from '@/backend/domain/models/simulation-clock.model';
import { SimulationEvent } from '@/backend/domain/models/simulation-event.model';
import { SimulationState } from '@/backend/domain/models/simulation-state.model';
import { SeededRandomService } from '@/backend/domain/services/seeded-random.service';
import {
	BASE_TICK_INTERVAL_MS,
	MAP_HIGHLIGHT_TICKS,
	TIMELINE_LIMIT,
	tickIntervalMs,
	toWatchModeView,
} from '@/frontend/lib/watch-mode-view';
import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../../helpers/experiment-config';

function buildState(): SimulationState {
	const config = createTestConfig({
		seed: 1,
		population: 1,
		days: 1,
		initialSleepDeprivedRate: 0,
	});
	const city = City.generate(config.cityLayout, new SeededRandomService(1));
	return new SimulationState(config, city, [], SimulationClock.start());
}

/** 重要 Event を 1 件積む。id は採番順に e1, e2, ... になる */
function recordSignificant(state: SimulationState): SimulationEvent {
	return state.recordEvent(
		SimulationEvent.create({ id: state.nextEventId(), tick: 0, type: 'accident' }),
	);
}

describe('tickIntervalMs', () => {
	it('速度を上げるほど間隔が短くなる', () => {
		expect(tickIntervalMs(1)).toBe(BASE_TICK_INTERVAL_MS);
		expect(tickIntervalMs(4)).toBe(BASE_TICK_INTERVAL_MS / 4);
		expect(tickIntervalMs(8)).toBe(BASE_TICK_INTERVAL_MS / 8);
	});

	it('間隔は 0 にならない。0 だと setTimeout が詰まって UI が固まる', () => {
		expect(tickIntervalMs(8)).toBeGreaterThan(0);
	});
});

describe('toWatchModeView', () => {
	it('Tick と時刻ラベルを取り出す', () => {
		const state = buildState();
		state.clock = SimulationClock.fromTick(36);

		const view = toWatchModeView(state, false);

		expect(view.tick).toBe(36);
		expect(view.clockLabel).toBe('Day 1 09:00');
	});

	it('重要でない Event は Timeline へ出さない', () => {
		// Decision で埋まると事故・遅延・伝播が見えなくなる（要件定義 37 章）
		const state = buildState();
		state.recordEvent(
			SimulationEvent.create({ id: state.nextEventId(), tick: 0, type: 'decision' }),
		);
		const accident = recordSignificant(state);

		expect(toWatchModeView(state, false).recentEvents.map((event) => event.id)).toEqual([
			accident.id,
		]);
	});

	it('Timeline は新しい順に並べる', () => {
		const state = buildState();
		const first = recordSignificant(state);
		const second = recordSignificant(state);

		expect(toWatchModeView(state, false).recentEvents.map((event) => event.id)).toEqual([
			second.id,
			first.id,
		]);
	});

	it('Timeline の保持件数に上限を設ける', () => {
		const state = buildState();
		for (let i = 0; i < TIMELINE_LIMIT + 10; i++) {
			recordSignificant(state);
		}

		expect(toWatchModeView(state, false).recentEvents).toHaveLength(TIMELINE_LIMIT);
	});

	it('上限を超えたら古いものから捨てる', () => {
		const state = buildState();
		const events = Array.from({ length: TIMELINE_LIMIT + 3 }, () => recordSignificant(state));

		const view = toWatchModeView(state, false);

		expect(view.recentEvents[0]?.id).toBe(events.at(-1)?.id);
		expect(view.recentEvents.map((event) => event.id)).not.toContain(events[0]?.id);
	});

	it('Metrics は最新の断面を出す', () => {
		const state = buildState();
		state.metricsHistory.push({ tick: 0 } as never, { tick: 96 } as never);

		expect(toWatchModeView(state, false).metrics?.tick).toBe(96);
	});

	it('Metrics がまだ無ければ null', () => {
		expect(toWatchModeView(buildState(), false).metrics).toBeNull();
	});

	it('混雑している道路の ID を渡す', () => {
		const state = buildState();
		state.congestions.set('road-a', {
			roadId: 'road-a',
			extraMinutes: 10,
			causedByEventId: 'e1',
		});

		expect(toWatchModeView(state, false).congestedRoadIds).toEqual(['road-a']);
	});

	it('終了フラグをそのまま渡す', () => {
		const state = buildState();

		expect(toWatchModeView(state, true).finished).toBe(true);
		expect(toWatchModeView(state, false).finished).toBe(false);
	});
});

describe('toWatchModeView の City Map 表示', () => {
	it('直近に事故を起こした Agent を渡す', () => {
		const state = buildState();
		state.clock = SimulationClock.fromTick(10);
		state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick: 10,
				type: 'accident',
				actorId: 'agent-0001',
			}),
		);

		expect(toWatchModeView(state, false).accidentAgentIds).toEqual(['agent-0001']);
	});

	it('古い事故は残さない', () => {
		// 出しっぱなしにすると事故が起きていない時間帯まで赤くなる
		const state = buildState();
		state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick: 0,
				type: 'accident',
				actorId: 'agent-0001',
			}),
		);
		state.clock = SimulationClock.fromTick(MAP_HIGHLIGHT_TICKS + 1);

		expect(toWatchModeView(state, false).accidentAgentIds).toEqual([]);
	});

	it('同じ Agent が同じ窓の中で複数回事故を起こしても 1 件にまとめる', () => {
		const state = buildState();
		for (const tick of [0, 1]) {
			state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick,
					type: 'accident',
					actorId: 'agent-0001',
				}),
			);
		}
		state.clock = SimulationClock.fromTick(1);

		expect(toWatchModeView(state, false).accidentAgentIds).toEqual(['agent-0001']);
	});

	it('事故以外の Event は事故として渡さない', () => {
		const state = buildState();
		state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick: 0,
				type: 'overtime',
				actorId: 'agent-0001',
			}),
		);

		expect(toWatchModeView(state, false).accidentAgentIds).toEqual([]);
	});

	it('直近の Sleep Transmission を伝播元・伝播先の組で渡す', () => {
		const state = buildState();
		state.transmissions.push({
			fromAgentId: 'agent-0001',
			toAgentId: 'agent-0002',
			tick: 0,
			sleepLossMinutes: 45,
			causeEventId: 'e1',
			becameNewCase: false,
		});

		expect(toWatchModeView(state, false).transmissions).toEqual([
			{ fromAgentId: 'agent-0001', toAgentId: 'agent-0002' },
		]);
	});

	it('古い Sleep Transmission は残さない', () => {
		const state = buildState();
		state.transmissions.push({
			fromAgentId: 'agent-0001',
			toAgentId: 'agent-0002',
			tick: 0,
			sleepLossMinutes: 45,
			causeEventId: 'e1',
			becameNewCase: false,
		});
		state.clock = SimulationClock.fromTick(MAP_HIGHLIGHT_TICKS + 1);

		expect(toWatchModeView(state, false).transmissions).toEqual([]);
	});
});
