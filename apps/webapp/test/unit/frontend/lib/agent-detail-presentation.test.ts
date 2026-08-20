import { Agent } from '@/backend/domain/models/agent.model';
import type { SleepTransmission } from '@/backend/presentation/composition/watch-mode-engine.composition';
import {
	agentDetailRows,
	formatAgentIdList,
	transmissionsOf,
} from '@/frontend/lib/agent-detail-presentation';
import { describe, expect, it } from 'vitest';

/** 属性を固定した Agent。表示の桁数だけを検証するため reconstruct で値を直接置く */
function testAgent(overrides: Partial<Parameters<typeof Agent.reconstruct>[0]> = {}): Agent {
	return Agent.reconstruct({
		id: 'agent-0000',
		role: 'driver',
		homeId: 'home-0',
		workplaceId: 'logistics_hub-0',
		sleepNeedHours: 7.86,
		responsibility: 0.6543,
		riskTolerance: 0.1234,
		cooperativeness: 0.5,
		familyResponsibility: 0.5,
		currentLocationId: 'home-0',
		sleepDebtHours: 3.45678,
		fatigue: 72.6,
		stress: 41.4,
		workPressure: 0.5,
		currentAction: 'sleeping',
		sleepMinutesThisNight: 0,
		lastSleepStateName: 'normal',
		...overrides,
	});
}

function rowValue(rows: ReturnType<typeof agentDetailRows>, label: string): string | undefined {
	return rows.find((row) => row.label === label)?.value;
}

function transmission(fromAgentId: string, toAgentId: string): SleepTransmission {
	return {
		fromAgentId,
		toAgentId,
		tick: 0,
		sleepLossMinutes: 60,
		causeEventId: 'e1',
		becameNewCase: true,
	};
}

describe('agentDetailRows', () => {
	it('職種は表示名へ直す', () => {
		expect(rowValue(agentDetailRows(testAgent(), 0), 'Role')).toBe('Driver');
	});

	it('Sleep Debt は 2 桁。伝播の判定に効くので粗くしない', () => {
		expect(rowValue(agentDetailRows(testAgent(), 0), 'Sleep Debt')).toBe('3.46 h');
	});

	it('Fatigue と Stress は 0〜100 の目安なので整数で出す', () => {
		const rows = agentDetailRows(testAgent(), 0);

		expect(rowValue(rows, 'Fatigue')).toBe('73');
		expect(rowValue(rows, 'Stress')).toBe('41');
	});

	it('Sleep Need は 1 桁で出す', () => {
		expect(rowValue(agentDetailRows(testAgent(), 0), 'Sleep Need')).toBe('7.9 h');
	});

	it('性格パラメータは 2 桁で出す', () => {
		const rows = agentDetailRows(testAgent(), 0);

		expect(rowValue(rows, 'Responsibility')).toBe('0.65');
		expect(rowValue(rows, 'Risk Tolerance')).toBe('0.12');
	});

	it('Generation が無い Agent は - を出す', () => {
		// 伝播に巻き込まれていない Agent は世代を持たない
		expect(rowValue(agentDetailRows(testAgent(), undefined), 'Generation')).toBe('-');
	});

	it('Generation 0 を「世代なし」と取り違えない', () => {
		// 0 は Patient Zero を意味する
		expect(rowValue(agentDetailRows(testAgent(), 0), 'Generation')).toBe('0');
	});
});

describe('transmissionsOf', () => {
	const transmissions = [
		transmission('agent-0001', 'agent-0000'),
		transmission('agent-0000', 'agent-0002'),
		transmission('agent-0000', 'agent-0003'),
		transmission('agent-0004', 'agent-0005'),
	];

	it('自分へ渡した相手を親、自分が渡した相手を子として分ける', () => {
		// 向きを取り違えると因果の読み方が逆になる
		const result = transmissionsOf(transmissions, 'agent-0000');

		expect(result.parentIds).toEqual(['agent-0001']);
		expect(result.childIds).toEqual(['agent-0002', 'agent-0003']);
	});

	it('関係の無い Agent には空を返す', () => {
		expect(transmissionsOf(transmissions, 'agent-9999')).toEqual({
			parentIds: [],
			childIds: [],
		});
	});

	it('自分から自分への伝播は親にも子にも入る', () => {
		// 実際には起きないが、片側だけ落として不整合にはしない
		const result = transmissionsOf([transmission('agent-0000', 'agent-0000')], 'agent-0000');

		expect(result).toEqual({ parentIds: ['agent-0000'], childIds: ['agent-0000'] });
	});
});

describe('formatAgentIdList', () => {
	it('カンマ区切りで並べる', () => {
		expect(formatAgentIdList(['agent-0001', 'agent-0002'])).toBe('agent-0001, agent-0002');
	});

	it('1 件も無ければ - を出し、空欄と区別する', () => {
		expect(formatAgentIdList([])).toBe('-');
	});
});
