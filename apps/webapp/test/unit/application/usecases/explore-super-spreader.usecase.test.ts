import { ExploreSuperSpreaderUseCase } from '@/backend/application/usecases/explore-super-spreader.usecase';
import type {
	AiDecisionGateway,
	DecisionContext,
	DecisionResult,
} from '@/backend/domain/gateways/ai-decision.gateway';
import { SimulationEngine } from '@/backend/domain/services/simulation-engine.service';
import { RuleBasedAiDecisionGateway } from '@/backend/infrastructure/adapters/rule-based-ai-decision.adapter';
import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../../helpers/experiment-config';

function baseConfig(overrides: Record<string, unknown> = {}) {
	return createTestConfig({
		seed: 42,
		population: 40,
		days: 2,
		initialSleepDeprivedRate: 0,
		initialSleepDebtHours: 8,
		shockTarget: 'none',
		...overrides,
	});
}

function useCase() {
	return new ExploreSuperSpreaderUseCase(
		new RuleBasedAiDecisionGateway(),
		new RuleBasedAiDecisionGateway(),
	);
}

/** どちらの Gateway が呼ばれたかを数える。判断内容は Rule-based と同じにする */
class RecordingGateway implements AiDecisionGateway {
	calls = 0;
	private readonly inner = new RuleBasedAiDecisionGateway();

	async decide(context: DecisionContext): Promise<DecisionResult> {
		this.calls += 1;
		return this.inner.decide(context);
	}
}

describe('ExperimentConfig の Patient Zero 指定', () => {
	it('指定した Agent だけが初期 Sleep Debt を持つ', () => {
		const config = baseConfig({ patientZeroAgentId: 'agent-0000' });
		const engine = SimulationEngine.create(config, new RuleBasedAiDecisionGateway());
		const state = engine.initialize();

		const deprived = state
			.orderedAgents()
			.filter((agent) => agent.sleepDebtHours > 0)
			.map((agent) => agent.id);

		expect(deprived).toEqual(['agent-0000']);
		expect(state.generations.get('agent-0000')).toBe(0);
	});

	it('存在しない Agent を指定した場合は誰も Shock されない', () => {
		const config = baseConfig({ patientZeroAgentId: 'agent-9999' });
		const engine = SimulationEngine.create(config, new RuleBasedAiDecisionGateway());
		const state = engine.initialize();

		for (const agent of state.agents.values()) {
			expect(agent.sleepDebtHours).toBe(0);
		}
	});

	it('Patient Zero 指定時は shockTarget と初期睡眠不足率を使わない', () => {
		const config = baseConfig({
			patientZeroAgentId: 'agent-0000',
			shockTarget: 'driver',
			initialSleepDeprivedRate: 0.5,
		});
		const engine = SimulationEngine.create(config, new RuleBasedAiDecisionGateway());
		const state = engine.initialize();

		expect(state.orderedAgents().filter((agent) => agent.sleepDebtHours > 0)).toHaveLength(1);
	});

	it('withOverrides で Patient Zero を引き継ぐ', () => {
		const result = baseConfig({ patientZeroAgentId: 'agent-0003' }).withOverrides({ seed: 7 });
		expect(result.success && result.value.patientZeroAgentId).toBe('agent-0003');
	});
});

describe('ExploreSuperSpreaderUseCase', () => {
	it('Stage 1 は指定した数の Agent を評価する', async () => {
		const result = await useCase().execute({
			baseConfig: baseConfig(),
			stage1AgentLimit: 5,
			stage2TopN: 2,
			stage2Seeds: [1],
		});

		expect(result.stage1).toHaveLength(5);
		expect(new Set(result.stage1.map((score) => score.agentId)).size).toBe(5);
	});

	it('Stage 2 は Stage 1 の上位のみを再評価する', async () => {
		const result = await useCase().execute({
			baseConfig: baseConfig(),
			stage1AgentLimit: 6,
			stage2TopN: 2,
			stage2Seeds: [1, 2],
		});

		expect(result.stage2).toHaveLength(2);
		const stage1Top = result.stage1.slice(0, 2).map((score) => score.agentId);
		expect(new Set(result.stage2.map((score) => score.agentId))).toEqual(new Set(stage1Top));
	});

	it('Stage 2 は指定した Seed 数だけ実行する', async () => {
		const result = await useCase().execute({
			baseConfig: baseConfig(),
			stage1AgentLimit: 3,
			stage2TopN: 1,
			stage2Seeds: [1, 2, 3],
		});

		expect(result.stage2[0]?.runCount).toBe(3);
		expect(result.stage1[0]?.runCount).toBe(1);
	});

	it('ランキングは帰属 Reach → 伝播回数の順に並ぶ', async () => {
		const result = await useCase().execute({
			baseConfig: baseConfig(),
			stage1AgentLimit: 8,
			stage2TopN: 1,
			stage2Seeds: [1],
		});

		for (let i = 1; i < result.stage1.length; i++) {
			const previous = result.stage1[i - 1];
			const current = result.stage1[i];
			if (previous === undefined || current === undefined) {
				continue;
			}
			expect(previous.attributableReach).toBeGreaterThanOrEqual(current.attributableReach);
			if (previous.attributableReach === current.attributableReach) {
				expect(previous.transmissionCount).toBeGreaterThanOrEqual(current.transmissionCount);
			}
		}
	});

	it('進捗コールバックが Stage ごとに呼ばれる', async () => {
		const progress: { stage: 1 | 2; done: number; total: number }[] = [];
		await useCase().execute({
			baseConfig: baseConfig(),
			stage1AgentLimit: 3,
			stage2TopN: 2,
			stage2Seeds: [1],
			onProgress: (value) => progress.push(value),
		});

		expect(progress.filter((value) => value.stage === 1)).toHaveLength(3);
		expect(progress.filter((value) => value.stage === 2)).toHaveLength(2);
	});

	it('同じ入力なら同じランキングになる', async () => {
		const params = {
			baseConfig: baseConfig(),
			stage1AgentLimit: 5,
			stage2TopN: 2,
			stage2Seeds: [1],
		};
		const first = await useCase().execute(params);
		const second = await useCase().execute(params);

		expect(second.stage1.map((score) => score.agentId)).toEqual(
			first.stage1.map((score) => score.agentId),
		);
		expect(second.stage2).toEqual(first.stage2);
	});
});

describe('ExploreSuperSpreaderUseCase の Gateway 使い分け', () => {
	it('Stage 1 は Rule-based、Stage 2 は AI Decision の Gateway を使う（要件定義 31 章）', async () => {
		const ruleBased = new RecordingGateway();
		const ai = new RecordingGateway();
		let aiCallsAfterStage1 = -1;

		await new ExploreSuperSpreaderUseCase(ruleBased, ai).execute({
			baseConfig: baseConfig(),
			stage1AgentLimit: 3,
			stage2TopN: 1,
			stage2Seeds: [1],
			onProgress: ({ stage, done, total }) => {
				if (stage === 1 && done === total) {
					aiCallsAfterStage1 = ai.calls;
				}
			},
		});

		// 全 Agent を回す Stage 1 で AI を呼ぶと現実的な時間で終わらない
		expect(aiCallsAfterStage1).toBe(0);
		expect(ruleBased.calls).toBeGreaterThan(0);
		expect(ai.calls).toBeGreaterThan(0);
	});
});
