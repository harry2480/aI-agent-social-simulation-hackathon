import { City } from '@/backend/domain/models/city.model';
import { SimulationClock } from '@/backend/domain/models/simulation-clock.model';
import { SimulationEvent } from '@/backend/domain/models/simulation-event.model';
import { SimulationState } from '@/backend/domain/models/simulation-state.model';
import type { AgentRelationship } from '@/backend/domain/services/population.service';
import { SeededRandomService } from '@/backend/domain/services/seeded-random.service';
import { describe, expect, it } from 'vitest';
import { createTestAgent } from '../../../helpers/agent';
import { createTestConfig } from '../../../helpers/experiment-config';

function buildState(
	agents: ReturnType<typeof createTestAgent>[] = [],
	relationships: AgentRelationship[] = [],
): SimulationState {
	const config = createTestConfig({
		seed: 1,
		population: Math.max(1, agents.length),
		days: 1,
		initialSleepDeprivedRate: 0,
	});
	const city = City.generate(config.cityLayout, new SeededRandomService(1));
	return new SimulationState(config, city, agents, SimulationClock.start(), relationships);
}

describe('SimulationState.orderedAgents', () => {
	it('Map の挿入順ではなく ID 昇順で列挙する', () => {
		// 挿入順に依存すると、同じ Seed でも Tick の処理順が変わり再現性が壊れる
		const state = buildState([
			createTestAgent({ id: 'agent-0002' }),
			createTestAgent({ id: 'agent-0000' }),
			createTestAgent({ id: 'agent-0001' }),
		]);

		expect(state.orderedAgents().map((agent) => agent.id)).toEqual([
			'agent-0000',
			'agent-0001',
			'agent-0002',
		]);
	});
});

describe('SimulationState.decisionOrderedAgents', () => {
	it('Manager を先に、同じ優先度では ID 昇順に並べる', () => {
		// 同一 Tick で部下が先に退勤すると Work Network 経由の残業伝播が成立しない
		const state = buildState([
			createTestAgent({ id: 'agent-0000', role: 'office_worker' }),
			createTestAgent({ id: 'agent-0003', role: 'manager' }),
			createTestAgent({ id: 'agent-0001', role: 'office_worker' }),
			createTestAgent({ id: 'agent-0002', role: 'manager' }),
		]);

		expect(state.decisionOrderedAgents().map((agent) => agent.id)).toEqual([
			'agent-0002',
			'agent-0003',
			'agent-0000',
			'agent-0001',
		]);
	});
});

describe('SimulationState の Network 索引', () => {
	const relationships: AgentRelationship[] = [
		{ fromAgentId: 'agent-0000', toAgentId: 'agent-0001', kind: 'family' },
		{ fromAgentId: 'agent-0001', toAgentId: 'agent-0000', kind: 'family' },
		{ fromAgentId: 'agent-0002', toAgentId: 'agent-0000', kind: 'manager_of' },
		{ fromAgentId: 'agent-0002', toAgentId: 'agent-0001', kind: 'manager_of' },
		{ fromAgentId: 'agent-0000', toAgentId: 'agent-0001', kind: 'colleague' },
	];

	it('familyOf は同居する家族を返す', () => {
		const state = buildState([], relationships);

		expect(state.familyOf('agent-0000')).toEqual(['agent-0001']);
		expect(state.familyOf('agent-0001')).toEqual(['agent-0000']);
	});

	it('subordinatesOf は Manager の部下を全員返す', () => {
		const state = buildState([], relationships);

		expect(state.subordinatesOf('agent-0002')).toEqual(['agent-0000', 'agent-0001']);
	});

	it('managerOf は部下から見た上司を返す', () => {
		const state = buildState([], relationships);

		expect(state.managerOf('agent-0000')).toBe('agent-0002');
		expect(state.managerOf('agent-0002')).toBeUndefined();
	});

	it('関係の無い Agent には空配列を返す', () => {
		const state = buildState([], relationships);

		expect(state.familyOf('agent-9999')).toEqual([]);
		expect(state.subordinatesOf('agent-9999')).toEqual([]);
	});

	it('colleague は Household / Work の索引に混ざらない', () => {
		const state = buildState([], relationships);

		expect(state.familyOf('agent-0000')).not.toContain('agent-0002');
		expect(state.subordinatesOf('agent-0000')).toEqual([]);
	});
});

describe('SimulationState.agent', () => {
	it('未知の Agent ID では例外にする', () => {
		const state = buildState([createTestAgent({ id: 'agent-0000' })]);

		expect(() => state.agent('agent-9999')).toThrow('unknown agent agent-9999');
	});
});

describe('SimulationState.nextEventId', () => {
	it('決定論的な連番を採番する', () => {
		const state = buildState();

		expect([state.nextEventId(), state.nextEventId(), state.nextEventId()]).toEqual([
			'e1',
			'e2',
			'e3',
		]);
	});
});

describe('SimulationState.recordEvent', () => {
	it('記録した Event を ID で引ける', () => {
		const state = buildState();
		const event = SimulationEvent.create({
			id: state.nextEventId(),
			tick: 0,
			type: 'accident',
			actorId: 'agent-0000',
		});

		state.recordEvent(event);

		expect(state.eventById(event.id)).toBe(event);
		expect(state.events).toHaveLength(1);
	});

	it('参照した入力 Event の分だけ因果エッジを張る', () => {
		// CausalEdge はこの経路からのみ作られるため、時間的に近いだけの Event は繋がらない
		const state = buildState();
		const cause = SimulationEvent.create({ id: state.nextEventId(), tick: 0, type: 'accident' });
		state.recordEvent(cause);

		const effect = SimulationEvent.create({
			id: state.nextEventId(),
			tick: 1,
			type: 'commute_delay',
			causes: [cause],
		});
		state.recordEvent(effect);

		expect(state.causalEdges).toHaveLength(1);
		expect(state.causalEdges[0]?.fromEventId).toBe(cause.id);
		expect(state.causalEdges[0]?.toEventId).toBe(effect.id);
	});

	it('原因を持たない Event では因果エッジを作らない', () => {
		const state = buildState();

		state.recordEvent(
			SimulationEvent.create({ id: state.nextEventId(), tick: 0, type: 'accident' }),
		);

		expect(state.causalEdges).toHaveLength(0);
	});

	it('未記録の Event ID は undefined を返す', () => {
		const state = buildState();

		expect(state.eventById('e999')).toBeUndefined();
	});
});
