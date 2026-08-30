import type { AiDecisionGateway } from '../../domain/gateways/ai-decision.gateway';
import {
	type ConditionAggregate,
	aggregateSummaries,
} from '../../domain/models/experiment-aggregate.model';
import {
	ExperimentConfig,
	type ExperimentConfigParams,
} from '../../domain/models/experiment-config.model';
import {
	type BatchExperimentKind,
	DEFAULT_BATCH_BASE,
	experimentPlanOf,
	totalRunCount,
} from '../../domain/models/experiment-plan.model';
import type { RunSummary } from '../../domain/models/metrics.model';
import type { SimulationState } from '../../domain/models/simulation-state.model';
import { SimulationEngine } from '../../domain/services/simulation-engine.service';

export interface BatchProgress {
	done: number;
	total: number;
	/** 実行中の条件。進捗表示で「今どこを回しているか」を出す */
	label: string;
}

export interface BatchRunResult {
	config: ExperimentConfig;
	state: SimulationState;
	summary: RunSummary;
}

export interface RunExperimentParams {
	kind: BatchExperimentKind;
	/** 条件ごとに回す Seed 数。1 以上 */
	seeds: number;
	/** 基準条件。Experimental Variable 以外はここで固定する（要件定義 28 章） */
	base?: ExperimentConfigParams;
	onProgress?: (progress: BatchProgress) => void | Promise<void>;
	/**
	 * Run 1 本が終わるたびに呼ぶ。Run 単位（Agent / Event / Metrics）の保存に使う。
	 * ブラウザ実行では渡さない（送信量が Run 数に比例して膨らむため集計だけを保存する）。
	 */
	onRunFinished?: (run: BatchRunResult) => void | Promise<void>;
}

/**
 * Experiment Mode の Batch 実行（要件定義 26・30・32・40 章）。
 *
 * スクリプト（Node）とブラウザのどちらからも同じ手順で回せるよう、
 * ループと集計をここへ置く。実行経路が変わっても条件表・集計・判定が変わらない。
 *
 * 進捗は onProgress で通知する。ブラウザ実行はこのコールバックの中で
 * 描画へ制御を返し、長い Batch でも画面が固まらないようにする。
 */
export class RunExperimentUseCase {
	constructor(private readonly aiDecisionGateway: AiDecisionGateway) {}

	async execute(params: RunExperimentParams): Promise<ConditionAggregate[]> {
		if (!Number.isInteger(params.seeds) || params.seeds < 1) {
			throw new Error('seeds には 1 以上の整数を指定してください');
		}

		const plan = experimentPlanOf(params.kind);
		const base = params.base ?? DEFAULT_BATCH_BASE;
		const total = totalRunCount(plan, params.seeds);
		const summariesByLabel = new Map<string, RunSummary[]>();
		let done = 0;

		if (plan.mode === 'judgement') {
			// 判定条件は Simulation の挙動に影響しないため、Run は Seed ごとに 1 本だけ回し、
			// 同じ Run を判定条件の数だけ数え直す（要件定義 24 章の感度分析）
			for (let seed = 1; seed <= params.seeds; seed++) {
				const { engine, state, config, summary } = await this.runOnce(base, { seed });
				await params.onRunFinished?.({ config, state, summary });

				for (const condition of plan.conditions) {
					this.collect(
						summariesByLabel,
						condition.label,
						engine.summarize(state, condition.thresholds),
					);
				}
				done += 1;
				await params.onProgress?.({ done, total, label: `seed ${seed}` });
			}
		} else {
			for (const condition of plan.conditions) {
				for (let seed = 1; seed <= params.seeds; seed++) {
					const { state, config, summary } = await this.runOnce(base, {
						...condition.overrides,
						seed,
					});
					await params.onRunFinished?.({ config, state, summary });

					this.collect(summariesByLabel, condition.label, summary);
					done += 1;
					await params.onProgress?.({ done, total, label: condition.label });
				}
			}
		}

		return plan.conditions.map((condition) =>
			aggregateSummaries(condition.label, summariesByLabel.get(condition.label) ?? []),
		);
	}

	/** Experiment Mode は Rule-based 固定。AI の非決定性を排除し、大量実行のコストを抑える */
	private async runOnce(
		base: ExperimentConfigParams,
		overrides: Partial<ExperimentConfigParams>,
	): Promise<BatchRunResult & { engine: SimulationEngine }> {
		const configResult = ExperimentConfig.create({ ...base, ...overrides });
		if (!configResult.success) {
			// 条件表と base の組み合わせが不正なら、Run を 1 本も回さずに止める
			throw new Error(`invalid experiment config: ${configResult.error}`);
		}

		const engine = SimulationEngine.create(configResult.value, this.aiDecisionGateway);
		const state = engine.initialize();
		const summary = await engine.run(state);
		return { engine, config: configResult.value, state, summary };
	}

	private collect(
		summariesByLabel: Map<string, RunSummary[]>,
		label: string,
		summary: RunSummary,
	): void {
		const summaries = summariesByLabel.get(label);
		if (summaries === undefined) {
			summariesByLabel.set(label, [summary]);
			return;
		}
		summaries.push(summary);
	}
}
