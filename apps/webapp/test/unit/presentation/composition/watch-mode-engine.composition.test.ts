import {
	buildCausalSubgraph,
	buildWatchRunPayload,
	createWatchModeEngine,
	findCausalFocusEventForAgent,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../../helpers/experiment-config';

function config() {
	return createTestConfig({
		seed: 42,
		population: 60,
		days: 3,
		initialSleepDeprivedRate: 0.3,
		shockTarget: 'driver',
	});
}

async function runWatchMode() {
	const engine = createWatchModeEngine(config(), { aiDecisionEnabled: false });
	const state = engine.initialize();
	const summary = await engine.run(state);
	return { engine, state, summary };
}

describe('createWatchModeEngine', () => {
	it('AI Decision 無効なら Rule-based で完結し、通信なしで完走する', async () => {
		const { state, summary } = await runWatchMode();

		expect(state.clock.tick).toBe(3 * 96);
		expect(summary.cascadeReach).toBeGreaterThanOrEqual(0);
	});

	it('同じ Config なら同じ結果になる', async () => {
		const first = await runWatchMode();
		const second = await runWatchMode();
		expect(second.summary).toEqual(first.summary);
	});
});

describe('buildWatchRunPayload', () => {
	it('保存用ペイロードへ Run の内容を詰める', async () => {
		const { state, summary } = await runWatchMode();

		const payload = buildWatchRunPayload(state, summary);

		expect(payload.seed).toBe(42);
		expect(payload.population).toBe(60);
		expect(payload.days).toBe(3);
		expect(payload.agents).toHaveLength(60);
		expect(payload.summary).toEqual(summary);
		expect(Array.isArray(payload.events)).toBe(true);
		expect(Array.isArray(payload.metrics)).toBe(true);
	});

	it('Server Action へ渡せるようミュータブルな配列にする', async () => {
		const { state, summary } = await runWatchMode();
		const payload = buildWatchRunPayload(state, summary);

		expect(() => payload.agents.push(payload.agents[0] as never)).not.toThrow();
	});
});

describe('findCausalFocusEventForAgent / buildCausalSubgraph', () => {
	/** 睡眠損失を受けた Agent を 1 人選ぶ。新規ケース化は短期間では成立しないことがある */
	function pickVictim(state: Awaited<ReturnType<typeof runWatchMode>>['state']): string {
		const lossEvent = state.events.find(
			(event) =>
				(event.type === 'sleep_opportunity_loss' || event.type === 'sleep_loss') &&
				event.actorId !== undefined &&
				event.causedByEventIds.length > 0,
		);
		const actorId = lossEvent?.actorId;
		if (actorId === undefined) {
			throw new Error('テストの前提が崩れています: 睡眠損失 Event が発生していません');
		}
		return actorId;
	}

	it('睡眠損失を受けた Agent の起点 Event を見つけられる', async () => {
		const { state } = await runWatchMode();

		const focusEventId = findCausalFocusEventForAgent(state, pickVictim(state));

		expect(focusEventId).toBeDefined();
	});

	it('起点 Event から因果の部分グラフを組み立てられる', async () => {
		const { state } = await runWatchMode();
		const focusEventId = findCausalFocusEventForAgent(state, pickVictim(state));

		const subgraph = buildCausalSubgraph(state, focusEventId ?? '');

		expect(subgraph.nodes.length).toBeGreaterThan(0);
		const included = new Set(subgraph.nodes.map((node) => node.eventId));
		for (const edge of subgraph.edges) {
			expect(included.has(edge.fromEventId)).toBe(true);
			expect(included.has(edge.toEventId)).toBe(true);
		}
	});

	it('ノード数上限を指定できる', async () => {
		const { state } = await runWatchMode();
		const focusEventId = findCausalFocusEventForAgent(state, pickVictim(state));

		const subgraph = buildCausalSubgraph(state, focusEventId ?? '', { maxNodes: 3 });

		expect(subgraph.nodes.length).toBeLessThanOrEqual(3);
	});

	it('伝播に関与していない Agent では起点が見つからないことがある', async () => {
		const { state } = await runWatchMode();
		expect(findCausalFocusEventForAgent(state, 'agent-9999')).toBeUndefined();
	});
});
