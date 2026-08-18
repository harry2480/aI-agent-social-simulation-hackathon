import {
	RunSimulationUseCase,
	buildRunPersistencePayload,
} from '@/backend/application/usecases/run-simulation.usecase';
import { ExperimentConfig } from '@/backend/domain/models/experiment-config.model';
import type {
	RunPersistencePayload,
	SimulationRunRepository,
	StoredRun,
} from '@/backend/domain/repositories/simulation-run.repository';
import { SimulationEngine } from '@/backend/domain/services/simulation-engine.service';
import { RuleBasedAiDecisionGateway } from '@/backend/infrastructure/adapters/rule-based-ai-decision.adapter';
import { describe, expect, it, vi } from 'vitest';

/** DB へ触れないインメモリ実装。保存されたペイロードを検証できるようにする */
class FakeSimulationRunRepository implements SimulationRunRepository {
	readonly saved: RunPersistencePayload[] = [];

	async save(payload: RunPersistencePayload): Promise<string> {
		this.saved.push(payload);
		return `run-${this.saved.length}`;
	}

	async findById(): Promise<StoredRun | null> {
		return null;
	}

	async findByExperimentId(): Promise<StoredRun[]> {
		return [];
	}

	async findRecent(): Promise<StoredRun[]> {
		return [];
	}
}

function config() {
	return ExperimentConfig.create({
		seed: 42,
		population: 40,
		days: 2,
		initialSleepDeprivedRate: 0.2,
		shockTarget: 'driver',
	});
}

describe('RunSimulationUseCase', () => {
	it('Run を実行してサマリと State を返す', async () => {
		const useCase = new RunSimulationUseCase(new RuleBasedAiDecisionGateway(), null);

		const result = await useCase.execute({ config: config() });

		expect(result.runId).toBeNull();
		expect(result.state.agents.size).toBe(40);
		expect(result.state.clock.tick).toBe(2 * 96);
		expect(result.summary.cascadeReach).toBeGreaterThanOrEqual(0);
	});

	it('persist が false なら Repository を呼ばない', async () => {
		const repository = new FakeSimulationRunRepository();
		const useCase = new RunSimulationUseCase(new RuleBasedAiDecisionGateway(), repository);

		await useCase.execute({ config: config(), persist: false });

		expect(repository.saved).toHaveLength(0);
	});

	it('persist が true なら Repository へ保存して runId を返す', async () => {
		const repository = new FakeSimulationRunRepository();
		const useCase = new RunSimulationUseCase(new RuleBasedAiDecisionGateway(), repository);

		const result = await useCase.execute({ config: config(), persist: true });

		expect(result.runId).toBe('run-1');
		expect(repository.saved).toHaveLength(1);
		expect(repository.saved[0]?.seed).toBe(42);
		expect(repository.saved[0]?.population).toBe(40);
	});

	it('Repository が無ければ persist が true でも保存しない', async () => {
		const useCase = new RunSimulationUseCase(new RuleBasedAiDecisionGateway(), null);

		const result = await useCase.execute({ config: config(), persist: true });

		expect(result.runId).toBeNull();
	});

	it('experimentId を保存ペイロードへ引き継ぐ', async () => {
		const repository = new FakeSimulationRunRepository();
		const useCase = new RunSimulationUseCase(new RuleBasedAiDecisionGateway(), repository);

		await useCase.execute({ config: config(), persist: true, experimentId: 'exp-1' });

		expect(repository.saved[0]?.experimentId).toBe('exp-1');
	});

	it('onTick は Tick ごとに呼ばれる', async () => {
		const onTick = vi.fn();
		const shortConfig = ExperimentConfig.create({
			seed: 1,
			population: 10,
			days: 1,
			initialSleepDeprivedRate: 0,
		});
		const useCase = new RunSimulationUseCase(new RuleBasedAiDecisionGateway(), null);

		await useCase.execute({ config: shortConfig, onTick });

		expect(onTick).toHaveBeenCalledTimes(96);
	});
});

describe('buildRunPersistencePayload', () => {
	it('全 Agent と重要 Event のみを含める', async () => {
		const engine = SimulationEngine.create(config(), new RuleBasedAiDecisionGateway());
		const state = engine.initialize();
		const summary = await engine.run(state);

		const payload = buildRunPersistencePayload(state, summary, null);

		expect(payload.agents).toHaveLength(40);
		// decision は件数が多く重要 Event に含めないため、保存対象は全 Event より少ない
		expect(payload.events.length).toBeLessThanOrEqual(state.events.length);
		for (const event of payload.events) {
			expect(event.type).not.toBe('decision');
		}
	});

	it('Metrics はサンプリング間隔ごとの件数になる', async () => {
		const engine = SimulationEngine.create(config(), new RuleBasedAiDecisionGateway());
		const state = engine.initialize();
		const summary = await engine.run(state);

		const payload = buildRunPersistencePayload(state, summary, null);

		expect(payload.metrics).toHaveLength(state.metricsHistory.length);
		expect(payload.metrics.length).toBeLessThan(state.config.totalTicks);
	});

	it('Config スナップショットに実験条件を残す', async () => {
		const engine = SimulationEngine.create(config(), new RuleBasedAiDecisionGateway());
		const state = engine.initialize();
		const summary = await engine.run(state);

		const payload = buildRunPersistencePayload(state, summary, null);

		expect(payload.config).toMatchObject({
			seed: 42,
			population: 40,
			days: 2,
			shockTarget: 'driver',
		});
	});

	it('Causal Edge は保存対象 Event の間だけを残せるよう Event キーで表現する', async () => {
		const engine = SimulationEngine.create(config(), new RuleBasedAiDecisionGateway());
		const state = engine.initialize();
		const summary = await engine.run(state);

		const payload = buildRunPersistencePayload(state, summary, null);

		expect(payload.causalEdges).toHaveLength(state.causalEdges.length);
		for (const edge of payload.causalEdges) {
			expect(typeof edge.fromEventKey).toBe('string');
			expect(typeof edge.toEventKey).toBe('string');
		}
	});
});
