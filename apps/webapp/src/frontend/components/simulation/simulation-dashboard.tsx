'use client';

import { persistWatchRunAction } from '@/backend/presentation/actions/simulation.action';
import type {
	Agent,
	ExperimentConfigParams,
	InterventionName,
	ShockTarget,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import {
	buildCausalSubgraph,
	buildWatchRunPayload,
	findCausalFocusEventForAgent,
	sleepStateFrom,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import { AgentDetailPanel } from '@/frontend/components/agent-detail/agent-detail-panel';
import { CausalGraph } from '@/frontend/components/causal-graph/causal-graph';
import { CityMap } from '@/frontend/components/city-map/city-map';
import { KpiPanel } from '@/frontend/components/kpi/kpi-panel';
import { EventTimeline } from '@/frontend/components/timeline/event-timeline';
import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { Label } from '@/frontend/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/frontend/components/ui/select';
import { Switch } from '@/frontend/components/ui/switch';
import {
	type PlaybackSpeed,
	useWatchModeSimulation,
} from '@/frontend/hooks/use-watch-mode-simulation';
import {
	DEFAULT_EXPERIMENT_SETTINGS,
	type ExperimentSettings,
	loadStoredSettings,
	toExperimentConfigParams,
} from '@/frontend/lib/experiment-settings';
import {
	type SimulationFormState,
	formFromParams,
	formFromSettings,
	toRunParams,
} from '@/frontend/lib/simulation-form';
import { Pause, Play, RotateCcw, Save } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

const SPEEDS: PlaybackSpeed[] = [1, 4, 8];

const SHOCK_TARGETS: { value: ShockTarget; label: string }[] = [
	{ value: 'none', label: 'Baseline（なし）' },
	{ value: 'random', label: 'Random Shock' },
	{ value: 'driver', label: 'Driver Shock' },
	{ value: 'manager', label: 'Manager Shock' },
];

const INTERVENTIONS: { value: InterventionName | 'none'; label: string }[] = [
	{ value: 'none', label: 'なし' },
	{ value: 'mandatory_rest', label: 'Mandatory Rest' },
	{ value: 'overtime_limit', label: 'Overtime Limit' },
	{ value: 'flexible_work', label: 'Flexible Work' },
	{ value: 'remote_work', label: 'Remote Work' },
];

const DEFAULT_FORM: SimulationFormState = formFromSettings(DEFAULT_EXPERIMENT_SETTINGS);

export interface ReplaySource {
	runId: string;
	label: string;
	params: ExperimentConfigParams;
	/** Run 保存時に使われた AI Model */
	savedAiModel: string | null;
	/** いまサーバーが使う AI Model。保存時と違えば AI の判断は同じにならない */
	currentAiModel: string;
}

interface SimulationDashboardProps {
	/**
	 * Replay 対象の Run。
	 * Simulation Engine は同一 Seed・同一 Config なら同一結果になるため、
	 * 保存された Event 列を再生するのではなく、同じ条件で再実行して観察する。
	 */
	replay?: ReplaySource;
}

export function SimulationDashboard({ replay }: SimulationDashboardProps) {
	const {
		view,
		configError,
		isRunning,
		speed,
		setSpeed,
		initialize,
		start,
		pause,
		stateRef,
		summarize,
	} = useWatchModeSimulation();
	// localStorage はサーバーで読めないため、初期値は既定値にしてマウント後に差し替える
	const [settings, setSettings] = useState<ExperimentSettings>(DEFAULT_EXPERIMENT_SETTINGS);
	const [form, setForm] = useState<SimulationFormState>(() =>
		replay === undefined ? DEFAULT_FORM : formFromParams(replay.params),
	);
	const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
	const [focusEventId, setFocusEventId] = useState<string | null>(null);
	const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
	const [saveError, setSaveError] = useState<string | null>(null);

	const buildParams = useCallback(
		(next: SimulationFormState): ExperimentConfigParams =>
			toRunParams(next, settings, replay?.params),
		[replay, settings],
	);

	// Replay なら保存された Run の条件、そうでなければ Settings 画面の保存値で初期化する
	useEffect(() => {
		if (replay !== undefined) {
			initialize(replay.params);
			return;
		}
		const stored = loadStoredSettings();
		setSettings(stored);
		setForm(formFromSettings(stored));
		initialize(toExperimentConfigParams(stored));
	}, [initialize, replay]);

	const state = stateRef.current;
	const thresholds = state?.config.sleepStateThresholds ?? null;

	const sleepStateOf = useCallback(
		(agent: Agent) =>
			thresholds === null ? 'normal' : sleepStateFrom(agent.sleepDebtHours, thresholds),
		[thresholds],
	);

	const selectedAgent = useMemo(
		() => view?.agents.find((agent) => agent.id === selectedAgentId) ?? null,
		[view, selectedAgentId],
	);

	/** Agent を選んだら、その Agent が睡眠不足へ至った Event を因果の起点にする */
	const selectAgent = useCallback(
		(agentId: string) => {
			setSelectedAgentId(agentId);
			const current = stateRef.current;
			if (current !== null) {
				setFocusEventId(findCausalFocusEventForAgent(current, agentId) ?? null);
			}
		},
		[stateRef],
	);

	/** Timeline の Event を直接起点にする */
	const selectEvent = useCallback((eventId: string, actorId?: string) => {
		setFocusEventId(eventId);
		if (actorId !== undefined) {
			setSelectedAgentId(actorId);
		}
	}, []);

	// stateRef は書き換わっても再レンダリングを起こさないため、
	// Tick ごとに publish される view を条件に含めて再計算させる
	const subgraph = useMemo(() => {
		const current = stateRef.current;
		if (view === null || current === null || focusEventId === null) {
			return null;
		}
		return buildCausalSubgraph(current, focusEventId);
	}, [stateRef, focusEventId, view]);

	const reset = () => {
		pause();
		setSelectedAgentId(null);
		setFocusEventId(null);
		setSaveState('idle');
		setSaveError(null);
		initialize(buildParams(form));
	};

	/**
	 * Watch Mode の結果を永続化する。
	 * ブラウザからは Prisma を呼べないため Server Action へまとめて送る。
	 */
	const persist = async () => {
		const current = stateRef.current;
		const summary = summarize();
		if (current === null || summary === null) {
			return;
		}
		pause();
		setSaveState('saving');
		setSaveError(null);
		try {
			await persistWatchRunAction(buildWatchRunPayload(current, summary));
			setSaveState('saved');
		} catch (error) {
			setSaveState('error');
			setSaveError(error instanceof Error ? error.message : '保存に失敗しました');
		}
	};

	return (
		<div className="flex h-dvh min-h-0 flex-col gap-3 p-4">
			<header className="flex flex-wrap items-center gap-3">
				<h1 className="text-lg font-bold tracking-tight text-foreground">SLEEP CITY 2.0</h1>
				<span className="font-mono text-sm tabular-nums text-muted-foreground">
					{view?.clockLabel ?? '-'}
				</span>
				{replay === undefined ? null : (
					<span className="rounded bg-muted px-2 py-0.5 text-xs text-foreground">
						Replay: {replay.label}
					</span>
				)}
				{/* モデルは環境変数で決まるため、保存時と違う場合は AI の判断が再現しないことを示す */}
				{replay?.savedAiModel != null && replay.savedAiModel !== replay.currentAiModel ? (
					<span className="rounded bg-warning-bg px-2 py-0.5 text-xs text-warning">
						AI Model: 保存時 {replay.savedAiModel} / 実行時 {replay.currentAiModel}
					</span>
				) : null}
				<Link href="/experiments" className="text-xs text-muted-foreground underline">
					Experiment Dashboard
				</Link>
				<Link href="/critical-point" className="text-xs text-muted-foreground underline">
					Critical Point Explorer
				</Link>
				<Link href="/super-spreader" className="text-xs text-muted-foreground underline">
					Super-spreader Explorer
				</Link>
				<Link href="/settings" className="text-xs text-muted-foreground underline">
					Settings
				</Link>
				<div className="ml-auto flex items-center gap-2">
					{isRunning ? (
						<Button size="sm" variant="secondary" onClick={pause}>
							<Pause className="mr-1 h-4 w-4" /> 一時停止
						</Button>
					) : (
						<Button size="sm" onClick={start} disabled={view?.finished === true}>
							<Play className="mr-1 h-4 w-4" /> 再生
						</Button>
					)}
					{SPEEDS.map((value) => (
						<Button
							key={value}
							size="sm"
							variant={speed === value ? 'default' : 'outline'}
							onClick={() => setSpeed(value)}
						>
							{value}x
						</Button>
					))}
					<Button size="sm" variant="outline" onClick={reset}>
						<RotateCcw className="mr-1 h-4 w-4" /> リセット
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() => void persist()}
						disabled={saveState === 'saving' || view === null}
					>
						<Save className="mr-1 h-4 w-4" />
						{saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '保存済み' : '結果を保存'}
					</Button>
				</div>
			</header>

			<section className="grid grid-cols-2 gap-3 md:grid-cols-6">
				<div className="space-y-1">
					<Label htmlFor="seed" className="text-xs">
						Seed
					</Label>
					<Input
						id="seed"
						type="number"
						value={form.seed}
						onChange={(event) => setForm({ ...form, seed: Number(event.target.value) })}
					/>
				</div>
				<div className="space-y-1">
					<Label htmlFor="population" className="text-xs">
						Population
					</Label>
					<Input
						id="population"
						type="number"
						min={1}
						max={500}
						value={form.population}
						onChange={(event) => setForm({ ...form, population: Number(event.target.value) })}
					/>
				</div>
				<div className="space-y-1">
					<Label htmlFor="days" className="text-xs">
						Days
					</Label>
					<Input
						id="days"
						type="number"
						min={1}
						max={14}
						value={form.days}
						onChange={(event) => setForm({ ...form, days: Number(event.target.value) })}
					/>
				</div>
				<div className="space-y-1">
					<Label htmlFor="rate" className="text-xs">
						初期睡眠不足率
					</Label>
					<Input
						id="rate"
						type="number"
						step={0.01}
						min={0}
						max={1}
						value={form.initialSleepDeprivedRate}
						onChange={(event) =>
							setForm({ ...form, initialSleepDeprivedRate: Number(event.target.value) })
						}
					/>
				</div>
				<div className="space-y-1">
					<Label className="text-xs">Shock Target</Label>
					<Select
						value={form.shockTarget}
						onValueChange={(value) => setForm({ ...form, shockTarget: value as ShockTarget })}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{SHOCK_TARGETS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-end gap-2 pb-1">
					<Switch
						id="ai-decision"
						checked={form.aiDecisionEnabled}
						onCheckedChange={(checked) => setForm({ ...form, aiDecisionEnabled: checked })}
					/>
					<Label htmlFor="ai-decision" className="text-xs">
						AI Decision
					</Label>
				</div>
				<div className="space-y-1">
					<Label className="text-xs">Intervention</Label>
					<Select
						value={form.intervention}
						onValueChange={(value) =>
							setForm({ ...form, intervention: value as InterventionName | 'none' })
						}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{INTERVENTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</section>

			<div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
				<div className="flex min-h-0 flex-col lg:col-span-2">
					{state === null || view === null ? (
						<p className="text-sm text-muted-foreground">初期化中…</p>
					) : (
						<CityMap
							city={state.city}
							agents={view.agents}
							sleepStateOf={sleepStateOf}
							congestedRoadIds={view.congestedRoadIds}
							accidentAgentIds={view.accidentAgentIds}
							transmissions={view.transmissions}
							selectedAgentId={selectedAgentId}
							onSelectAgent={selectAgent}
						/>
					)}
				</div>
				<div className="flex min-h-0 flex-col gap-3">
					<KpiPanel metrics={view?.metrics ?? null} population={state?.config.population ?? 0} />
					<AgentDetailPanel
						agent={selectedAgent}
						sleepState={selectedAgent === null ? null : sleepStateOf(selectedAgent)}
						state={state}
					/>
				</div>
			</div>

			{configError !== null ? (
				<p role="alert" className="text-xs text-destructive">
					{configError}
				</p>
			) : null}

			{saveError !== null ? (
				<p role="alert" className="text-xs text-destructive">
					{saveError}
				</p>
			) : null}

			<div className="grid min-h-0 basis-72 grid-cols-1 gap-3 lg:grid-cols-2">
				<EventTimeline events={view?.recentEvents ?? []} onSelectEvent={selectEvent} />
				<CausalGraph
					subgraph={subgraph}
					selectedEventId={focusEventId}
					onSelectEvent={(eventId) => selectEvent(eventId)}
				/>
			</div>
		</div>
	);
}
