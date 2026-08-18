import type { AiDecisionGateway } from '../../domain/gateways/ai-decision.gateway';
import type { AgentRole } from '../../domain/models/agent.model';
import type { ExperimentConfig } from '../../domain/models/experiment-config.model';
import type { NetworkName } from '../../domain/models/simulation-event.model';
import { CascadeService } from '../../domain/services/cascade.service';
import { ReproductionNumberService } from '../../domain/services/reproduction-number.service';
import { SimulationEngine } from '../../domain/services/simulation-engine.service';

export interface SuperSpreaderScore {
	agentId: string;
	role: AgentRole;
	/** 何 Run を集計したか */
	runCount: number;
	/** この Agent に帰属する新規ケース数（伝播グラフを起点から辿った到達数） */
	attributableReach: number;
	/** この Agent が 30 分以上の睡眠機会損失を与えた回数 */
	transmissionCount: number;
	/** Run 全体の Cascade Reach。背景の自然発生を含むため比較には使わない */
	cascadeReach: number;
	cascadeProbability: number;
	individualRs: number;
	cascadeDepth: number;
	totalSleepLossMinutes: number;
	networksTraversed: NetworkName[];
	crossNetworkSpread: number;
}

export interface SuperSpreaderResult {
	/** Stage 1（Rule-based 高速探索）の全 Agent 評価 */
	stage1: SuperSpreaderScore[];
	/** Stage 2（上位 Agent を複数 Seed・AI Decision 有効で再評価） */
	stage2: SuperSpreaderScore[];
}

export interface ExploreSuperSpreaderParams {
	baseConfig: ExperimentConfig;
	/** Stage 1 で評価する Agent を絞る場合の上限。未指定なら全 Agent */
	stage1AgentLimit?: number;
	/** Stage 2 へ進める上位 Agent 数（要件定義 31 章では 10〜20） */
	stage2TopN?: number;
	/** Stage 2 で使う Seed 群 */
	stage2Seeds?: readonly number[];
	onProgress?: (progress: { stage: 1 | 2; done: number; total: number }) => void;
}

const DEFAULT_STAGE2_TOP_N = 10;
const DEFAULT_STAGE2_SEEDS = [1, 2, 3];

/**
 * Sleep Super-spreader Explorer（要件定義 31 章）。
 *
 * 全 Agent について重い AI Simulation を行うと現実的な時間で終わらないため、2 段階探索とする。
 * - Stage 1: Rule-based の高速 Simulation で全 Agent を Patient Zero 候補として評価
 * - Stage 2: 上位 Agent のみ AI Decision を有効にし、複数 Seed で再評価
 */
export class ExploreSuperSpreaderUseCase {
	private readonly reproductionNumberService = new ReproductionNumberService();
	private readonly cascadeService = new CascadeService(this.reproductionNumberService);

	constructor(
		private readonly ruleBasedGateway: AiDecisionGateway,
		private readonly aiGateway: AiDecisionGateway,
	) {}

	async execute(params: ExploreSuperSpreaderParams): Promise<SuperSpreaderResult> {
		const candidates = this.listCandidates(params);

		const stage1: SuperSpreaderScore[] = [];
		for (const [index, agentId] of candidates.entries()) {
			stage1.push(
				await this.evaluate(
					agentId,
					params.baseConfig,
					[params.baseConfig.seed],
					this.ruleBasedGateway,
				),
			);
			params.onProgress?.({ stage: 1, done: index + 1, total: candidates.length });
		}
		stage1.sort(compareScore);

		const topN = params.stage2TopN ?? DEFAULT_STAGE2_TOP_N;
		const seeds = params.stage2Seeds ?? DEFAULT_STAGE2_SEEDS;
		const finalists = stage1.slice(0, topN);

		const stage2: SuperSpreaderScore[] = [];
		for (const [index, finalist] of finalists.entries()) {
			stage2.push(await this.evaluate(finalist.agentId, params.baseConfig, seeds, this.aiGateway));
			params.onProgress?.({ stage: 2, done: index + 1, total: finalists.length });
		}
		stage2.sort(compareScore);

		return { stage1, stage2 };
	}

	/** Patient Zero 候補の Agent ID 一覧。Population 生成と同じ順序で決まる */
	private listCandidates(params: ExploreSuperSpreaderParams): string[] {
		const probeConfig = this.withPatientZero(params.baseConfig, null);
		const engine = SimulationEngine.create(probeConfig, this.ruleBasedGateway);
		const ids = engine
			.initialize()
			.orderedAgents()
			.map((agent) => agent.id);
		return params.stage1AgentLimit === undefined ? ids : ids.slice(0, params.stage1AgentLimit);
	}

	/** 指定 Agent を Patient Zero として複数 Seed で実行し、平均を取る */
	private async evaluate(
		agentId: string,
		baseConfig: ExperimentConfig,
		seeds: readonly number[],
		gateway: AiDecisionGateway,
	): Promise<SuperSpreaderScore> {
		let role: AgentRole = 'office_worker';
		let attributableReach = 0;
		let transmissionCount = 0;
		let cascadeReach = 0;
		let cascadeCount = 0;
		let individualRs = 0;
		let cascadeDepth = 0;
		let totalSleepLossMinutes = 0;
		const networks = new Set<NetworkName>();

		for (const seed of seeds) {
			const configResult = this.withPatientZero(baseConfig, agentId).withOverrides({ seed });
			if (!configResult.success) {
				throw new Error(`ExploreSuperSpreaderUseCase: invalid config (${configResult.error})`);
			}

			const engine = SimulationEngine.create(configResult.value, gateway);
			const state = engine.initialize();
			const summary = await engine.run(state);

			role = state.agent(agentId).role;
			attributableReach += this.cascadeService.reachFrom(state, agentId);
			transmissionCount += this.cascadeService.transmissionCountFrom(state, agentId);
			cascadeReach += summary.cascadeReach;
			cascadeCount += summary.cascadeOccurred ? 1 : 0;
			individualRs += this.reproductionNumberService.individualRs(state, agentId);
			cascadeDepth = Math.max(cascadeDepth, summary.cascadeDepth);
			totalSleepLossMinutes += summary.totalSleepLossMinutes;
			for (const network of this.cascadeService.networksTraversedFrom(state, agentId)) {
				networks.add(network);
			}
		}

		const runCount = seeds.length;
		const traversed = [...networks].sort();
		return {
			agentId,
			role,
			runCount,
			attributableReach: attributableReach / runCount,
			transmissionCount: transmissionCount / runCount,
			cascadeReach: cascadeReach / runCount,
			cascadeProbability: cascadeCount / runCount,
			individualRs: individualRs / runCount,
			cascadeDepth,
			totalSleepLossMinutes: totalSleepLossMinutes / runCount,
			networksTraversed: traversed,
			crossNetworkSpread: traversed.length,
		};
	}

	/** Patient Zero を固定した Config を作る。Shock の比率指定は無効化される */
	private withPatientZero(baseConfig: ExperimentConfig, agentId: string | null): ExperimentConfig {
		const result = baseConfig.withOverrides({
			patientZeroAgentId: agentId ?? undefined,
			shockTarget: agentId === null ? baseConfig.shockTarget : 'none',
		});
		if (!result.success) {
			throw new Error(`ExploreSuperSpreaderUseCase: invalid config (${result.error})`);
		}
		return result.value;
	}
}

/**
 * ランキング順。
 *
 * その Agent に帰属する新規ケース数を主指標とし、同点では伝播回数で並べる。
 * 新規ケース化は短い期間ではほとんど成立しないため、帰属 Reach だけでは
 * 差がつかず順位が Agent ID 順になってしまう。
 * 以降は Network 横断数・Individual Rs・Agent ID の順（決定論を保つため）。
 */
function compareScore(a: SuperSpreaderScore, b: SuperSpreaderScore): number {
	return (
		b.attributableReach - a.attributableReach ||
		b.transmissionCount - a.transmissionCount ||
		b.crossNetworkSpread - a.crossNetworkSpread ||
		b.individualRs - a.individualRs ||
		a.agentId.localeCompare(b.agentId)
	);
}
