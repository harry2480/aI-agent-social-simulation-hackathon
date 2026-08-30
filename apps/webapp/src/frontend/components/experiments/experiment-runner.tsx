'use client';

import { ExperimentComparisonTable } from '@/frontend/components/experiments/experiment-comparison-table';
import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import { Progress } from '@/frontend/components/ui/progress';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/frontend/components/ui/select';
import { useExperimentBatch } from '@/frontend/hooks/use-experiment-batch';
import {
	BATCH_KIND_LABELS,
	type BatchExperimentKind,
	type BatchFormState,
	DEFAULT_BATCH_FORM,
	MAX_BATCH_SEEDS,
	batchProgressPercent,
	parseBatchForm,
	toComparisonResults,
} from '@/frontend/lib/experiment-batch';
import Link from 'next/link';
import { useState } from 'react';

interface ExperimentRunnerProps {
	databaseConfigured: boolean;
}

const KIND_OPTIONS = Object.entries(BATCH_KIND_LABELS) as [BatchExperimentKind, string][];

/**
 * Batch 実験をブラウザで実行する（要件定義 26・30・32 章）。
 *
 * Multi-seed / Sweep はサーバーの実行時間上限に当たるため、Watch Mode と同じく
 * ブラウザで Run を回し、結果の集計だけを保存する。Run 単位の時系列まで要る場合は
 * `scripts/run-experiment.ts` を使う。
 */
export function ExperimentRunner({ databaseConfigured }: ExperimentRunnerProps) {
	const [form, setForm] = useState<BatchFormState>(DEFAULT_BATCH_FORM);
	const { status, progress, results, experimentId, error, run, cancel } =
		useExperimentBatch(databaseConfigured);

	const parsed = parseBatchForm(form);
	const formError = 'error' in parsed ? parsed.error : null;
	const plan = 'plan' in parsed ? parsed.plan : null;
	const busy = status === 'running' || status === 'saving';

	const update = (patch: Partial<BatchFormState>): void => {
		setForm({ ...form, ...patch });
	};

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm">実験を実行する</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3 p-4 pt-0">
				<div className="grid grid-cols-1 gap-3 md:grid-cols-4">
					<div className="space-y-1 md:col-span-2">
						<Label htmlFor="batch-kind" className="text-xs">
							実験の種類
						</Label>
						<Select
							value={form.kind}
							onValueChange={(kind) => update({ kind: kind as BatchExperimentKind })}
							disabled={busy}
						>
							<SelectTrigger id="batch-kind" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{KIND_OPTIONS.map(([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<NumberField
						id="batch-population"
						label="Population"
						value={form.population}
						step={10}
						disabled={busy}
						onChange={(population) => update({ population })}
					/>
					<NumberField
						id="batch-days"
						label="Days"
						value={form.days}
						step={1}
						disabled={busy}
						onChange={(days) => update({ days })}
					/>
					<NumberField
						id="batch-seeds"
						label={`Seed 数（最大 ${MAX_BATCH_SEEDS}）`}
						value={form.seeds}
						step={1}
						disabled={busy}
						onChange={(seeds) => update({ seeds })}
					/>
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<Button
						size="sm"
						disabled={plan === null || busy}
						onClick={() => {
							if (plan !== null) {
								void run(plan);
							}
						}}
					>
						{busy ? '実行中…' : '実行する'}
					</Button>
					{/* 保存は途中で止められないため、Run を回している間だけ出す */}
					{status === 'running' ? (
						<Button size="sm" variant="outline" onClick={cancel}>
							中止
						</Button>
					) : null}
					{formError !== null ? (
						<span className="text-xs text-destructive">{formError}</span>
					) : plan !== null && !busy ? (
						<span className="text-xs text-muted-foreground">
							{/* 判定を振る実験は Run を共有するため、条件 × Seed の等式が成り立たない */}
							{plan.sharesRuns
								? `Run ${plan.totalRuns} 本（${plan.conditionCount} 通りの判定条件で数え直します）`
								: `${plan.conditionCount} 条件 × ${plan.seeds} Seed = Run ${plan.totalRuns} 本`}
						</span>
					) : null}
				</div>

				{busy ? (
					<div className="space-y-1">
						<Progress value={batchProgressPercent(progress.done, progress.total)} />
						<p className="text-xs text-muted-foreground">
							{status === 'saving'
								? '結果を保存しています…'
								: `Run ${progress.done} / ${progress.total}${progress.label === '' ? '' : `（${progress.label}）`}`}
						</p>
					</div>
				) : null}

				{error !== null ? <p className="text-xs text-destructive">{error}</p> : null}

				{!databaseConfigured ? (
					<p className="text-xs text-muted-foreground">
						DATABASE_URL が未設定のため、結果は保存されずこの画面にのみ表示されます。
					</p>
				) : null}

				{results.length > 0 ? (
					<div className="space-y-2 text-xs">
						{experimentId !== null ? (
							<p className="text-muted-foreground">
								保存しました。
								<Link href={`/experiments/${experimentId}`} className="ml-1 underline">
									実験の詳細を開く
								</Link>
							</p>
						) : null}
						<ExperimentComparisonTable results={toComparisonResults(results)} />
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

interface NumberFieldProps {
	/** Label と Input を紐付けるための一意な id */
	id: string;
	label: string;
	value: number;
	step: number;
	disabled: boolean;
	onChange: (value: number) => void;
}

function NumberField({ id, label, value, step, disabled, onChange }: NumberFieldProps) {
	return (
		<div className="space-y-1">
			<Label htmlFor={id} className="text-xs">
				{label}
			</Label>
			<Input
				id={id}
				type="number"
				step={step}
				value={value}
				disabled={disabled}
				onChange={(event) => onChange(Number(event.target.value))}
			/>
		</div>
	);
}
