import { DecideAgentActionUseCase } from '@/backend/application/usecases/decide-agent-action.usecase';
import { RunSimulationUseCase } from '@/backend/application/usecases/run-simulation.usecase';
import type { DecisionCacheGateway } from '@/backend/domain/gateways/decision-cache.gateway';
import { InMemoryDecisionCache } from '@/backend/infrastructure/adapters/in-memory-decision-cache.adapter';
import { OpenRouterAiDecisionGateway } from '@/backend/infrastructure/adapters/openrouter-ai-decision.adapter';
import { RuleBasedAiDecisionGateway } from '@/backend/infrastructure/adapters/rule-based-ai-decision.adapter';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestConfig } from '../../../helpers/experiment-config';

/**
 * OpenRouter 障害時の完走検証（実装計画 4 章 / 5 章の完了条件）。
 *
 * 実 API は叩かず、fetch を常時失敗させて OpenRouter Adapter の例外経路を通す。
 * 401 を返すのは、AI SDK がリトライしない非リトライ対象エラーであり
 * 「API キーが失効している」という現実の障害を再現できるため。
 */
const RUN_INTEGRATION = process.env.INTEGRATION_TEST === 'true';

/** 要件定義の標準規模。300 Agent × 7 日 = 672 Tick */
const POPULATION = 300;
const DAYS = 7;

function config() {
	return createTestConfig({
		seed: 42,
		population: POPULATION,
		days: DAYS,
		initialSleepDeprivedRate: 0.1,
		shockTarget: 'driver',
		aiDecisionEnabled: true,
	});
}

/**
 * Cache を挟まない実装。
 * Cache は Fatigue や遅延をビニングするため、境界付近の Context では
 * Rule-based を直接呼んだ場合と判断が変わる。縮退の検証ではこれを外す。
 */
class NoopDecisionCache implements DecisionCacheGateway {
	get(): undefined {
		return undefined;
	}

	set(): void {
		// 何も保持しない
	}
}

function alwaysFailingOpenRouter(cache: DecisionCacheGateway = new InMemoryDecisionCache()): {
	gateway: DecideAgentActionUseCase;
	callCount: () => number;
} {
	let calls = 0;
	vi.stubGlobal('fetch', async () => {
		calls += 1;
		return new Response(JSON.stringify({ error: { message: 'invalid api key' } }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	});

	return {
		gateway: new DecideAgentActionUseCase(
			new OpenRouterAiDecisionGateway('broken-key', 'test/model'),
			new RuleBasedAiDecisionGateway(),
			cache,
		),
		callCount: () => calls,
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe.skipIf(!RUN_INTEGRATION)('Simulation 全体 (integration)', () => {
	it('OpenRouter が常時失敗しても 300 Agent × 7 日の Run が完走する', async () => {
		const { gateway, callCount } = alwaysFailingOpenRouter();
		const useCase = new RunSimulationUseCase(gateway, null);

		const result = await useCase.execute({ config: config() });

		// 672 Tick を最後まで進めきったこと
		expect(result.state.clock.tick).toBe(DAYS * 96);
		expect(result.state.agents.size).toBe(POPULATION);
		expect(result.summary.totalSleepLossMinutes).toBeGreaterThan(0);

		// AI 呼び出しが実際に行われ、すべて失敗して Fallback へ切り替わったこと
		expect(callCount()).toBeGreaterThan(0);
		expect(gateway.failureCount).toBeGreaterThan(0);

		const decisions = result.state
			.orderedAgents()
			.map((agent) => agent.lastDecision)
			.filter((decision) => decision !== undefined);
		expect(decisions.length).toBeGreaterThan(0);
		expect(decisions.every((decision) => decision.model === 'rule-based')).toBe(true);
	});

	it('Cache を介さなければ Fallback Run は Rule-based Run と完全に一致する', async () => {
		const { gateway } = alwaysFailingOpenRouter(new NoopDecisionCache());

		const fallbackRun = await new RunSimulationUseCase(gateway, null).execute({
			config: config(),
		});

		vi.unstubAllGlobals();

		const ruleBasedRun = await new RunSimulationUseCase(
			new RuleBasedAiDecisionGateway(),
			null,
		).execute({ config: config() });

		// AI が一度も成功していない以上、Run は Rule-based へ完全に縮退する
		expect(fallbackRun.summary).toEqual(ruleBasedRun.summary);
		expect(fallbackRun.state.events.map((event) => event.type)).toEqual(
			ruleBasedRun.state.events.map((event) => event.type),
		);
	});

	it('Decision Cache を有効にしても同一 Seed なら結果が再現する', async () => {
		const first = await new RunSimulationUseCase(alwaysFailingOpenRouter().gateway, null).execute({
			config: config(),
		});
		vi.unstubAllGlobals();

		const second = await new RunSimulationUseCase(alwaysFailingOpenRouter().gateway, null).execute({
			config: config(),
		});

		expect(second.summary).toEqual(first.summary);
	});
});
