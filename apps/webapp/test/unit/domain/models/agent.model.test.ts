import { Agent } from '@/backend/domain/models/agent.model';
import { DEFAULT_SLEEP_STATE_THRESHOLDS } from '@/backend/domain/models/sleep-state.model';
import { SeededRandomService } from '@/backend/domain/services/seeded-random.service';
import { describe, expect, it } from 'vitest';

const thresholds = DEFAULT_SLEEP_STATE_THRESHOLDS;

function createAgent(overrides: { initialSleepDebtHours?: number } = {}): Agent {
	return Agent.create({
		id: 'agent-0001',
		role: 'office_worker',
		homeId: 'home-1',
		workplaceId: 'workplace-1',
		rng: new SeededRandomService(42),
		thresholds,
		...overrides,
	});
}

describe('Agent', () => {
	describe('create', () => {
		it('必要睡眠時間を 6.5〜8.5 時間の範囲で生成する', () => {
			for (let seed = 0; seed < 50; seed++) {
				const agent = Agent.create({
					id: `agent-${seed}`,
					role: 'driver',
					homeId: 'home-1',
					rng: new SeededRandomService(seed),
					thresholds,
				});
				expect(agent.sleepNeedHours).toBeGreaterThanOrEqual(6.5);
				expect(agent.sleepNeedHours).toBeLessThanOrEqual(8.5);
			}
		});

		it('性格パラメータを 0〜1 の範囲で生成する', () => {
			const agent = createAgent();
			for (const value of [
				agent.responsibility,
				agent.riskTolerance,
				agent.cooperativeness,
				agent.familyResponsibility,
			]) {
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThanOrEqual(1);
			}
		});

		it('同じ Seed なら同じ属性の Agent を生成する', () => {
			const a = createAgent();
			const b = createAgent();
			expect(a.sleepNeedHours).toBe(b.sleepNeedHours);
			expect(a.responsibility).toBe(b.responsibility);
		});
	});

	describe('fatigue / stress の範囲', () => {
		it('fatigue は 0 未満にならない', () => {
			const agent = createAgent();
			agent.addFatigue(-1000);
			expect(agent.fatigue).toBe(0);
		});

		it('fatigue は 100 を超えない', () => {
			const agent = createAgent();
			agent.addFatigue(1000);
			expect(agent.fatigue).toBe(100);
		});

		it('stress は 0〜100 に収まる', () => {
			const agent = createAgent();
			agent.addStress(1000);
			expect(agent.stress).toBe(100);
			agent.addStress(-1000);
			expect(agent.stress).toBe(0);
		});
	});

	describe('applyNightSleep', () => {
		it('必要睡眠に満たない分を Sleep Debt へ加算する', () => {
			const agent = createAgent();
			agent.recordSleepMinutes((agent.sleepNeedHours - 2) * 60);
			const { deficitHours } = agent.applyNightSleep(0.5);
			expect(deficitHours).toBeCloseTo(2, 5);
			expect(agent.sleepDebtHours).toBeCloseTo(2, 5);
		});

		it('必要睡眠を超えた分は recoveryRate 倍だけ Sleep Debt を回復する', () => {
			const agent = createAgent();
			agent.addSleepDebtHours(3);
			agent.recordSleepMinutes((agent.sleepNeedHours + 2) * 60);
			const { recoveredHours } = agent.applyNightSleep(0.5);
			expect(recoveredHours).toBeCloseTo(1, 5);
			expect(agent.sleepDebtHours).toBeCloseTo(2, 5);
		});

		it('Sleep Debt は負にならない', () => {
			const agent = createAgent();
			agent.recordSleepMinutes((agent.sleepNeedHours + 10) * 60);
			agent.applyNightSleep(1);
			expect(agent.sleepDebtHours).toBe(0);
		});

		it('確定後はその晩の睡眠時間がリセットされる', () => {
			const agent = createAgent();
			agent.recordSleepMinutes(300);
			agent.applyNightSleep(0.5);
			expect(agent.sleepMinutesThisNight).toBe(0);
		});
	});

	describe('commitSleepStateTransition', () => {
		it('Normal から Sleep Deprived への遷移で true を返す', () => {
			const agent = createAgent();
			agent.addSleepDebtHours(2.5);
			expect(agent.commitSleepStateTransition(thresholds)).toBe(true);
		});

		it('既に Sleep Deprived なら二度目は false を返す', () => {
			const agent = createAgent();
			agent.addSleepDebtHours(2.5);
			agent.commitSleepStateTransition(thresholds);
			agent.addSleepDebtHours(1);
			expect(agent.commitSleepStateTransition(thresholds)).toBe(false);
		});

		it('Tired 止まりなら false を返す', () => {
			const agent = createAgent();
			agent.addSleepDebtHours(1.5);
			expect(agent.commitSleepStateTransition(thresholds)).toBe(false);
		});

		it('回復して再び悪化した場合は再び true を返す', () => {
			const agent = createAgent();
			agent.addSleepDebtHours(2.5);
			expect(agent.commitSleepStateTransition(thresholds)).toBe(true);
			agent.addSleepDebtHours(-2.5);
			expect(agent.commitSleepStateTransition(thresholds)).toBe(false);
			agent.addSleepDebtHours(3);
			expect(agent.commitSleepStateTransition(thresholds)).toBe(true);
		});
	});
});
