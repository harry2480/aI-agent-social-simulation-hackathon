'use client';

import { Button } from '@/frontend/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
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
	DEFAULT_EXPERIMENT_SETTINGS,
	type ExperimentSettings,
	SETTINGS_ERROR_MESSAGES,
	loadStoredSettings,
	saveStoredSettings,
	validateSettings,
} from '@/frontend/lib/experiment-settings';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface SettingsFormProps {
	/** サーバーが使う AI Model。API キーを守るためクライアントからは変更できない */
	currentAiModel: string;
}

const SHOCK_TARGETS = [
	{ value: 'none', label: 'Baseline（なし）' },
	{ value: 'random', label: 'Random Shock' },
	{ value: 'driver', label: 'Driver Shock' },
	{ value: 'manager', label: 'Manager Shock' },
] as const;

const INTERVENTIONS = [
	{ value: 'none', label: 'なし' },
	{ value: 'mandatory_rest', label: 'Mandatory Rest' },
	{ value: 'overtime_limit', label: 'Overtime Limit' },
	{ value: 'flexible_work', label: 'Flexible Work' },
	{ value: 'remote_work', label: 'Remote Work' },
] as const;

/**
 * Simulation の既定値を編集する。
 * 保存先はブラウザ（端末ごとの既定値）で、実行済みの Run / Experiment には影響しない。
 */
export function SettingsForm({ currentAiModel }: SettingsFormProps) {
	const [settings, setSettings] = useState<ExperimentSettings>(DEFAULT_EXPERIMENT_SETTINGS);
	const [saved, setSaved] = useState(false);

	// localStorage はサーバーで読めないため、マウント後に読み込む
	useEffect(() => {
		setSettings(loadStoredSettings());
	}, []);

	const error = validateSettings(settings);

	const update = (patch: Partial<ExperimentSettings>): void => {
		setSettings({ ...settings, ...patch });
		setSaved(false);
	};

	const save = (): void => {
		if (error !== null) {
			return;
		}
		saveStoredSettings(settings);
		setSaved(true);
	};

	const reset = (): void => {
		setSettings(DEFAULT_EXPERIMENT_SETTINGS);
		saveStoredSettings(DEFAULT_EXPERIMENT_SETTINGS);
		setSaved(true);
	};

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm">実験条件</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-2 gap-3 p-4 pt-0 md:grid-cols-4">
					<NumberField
						label="Seed"
						value={settings.seed}
						step={1}
						onChange={(seed) => update({ seed })}
					/>
					<NumberField
						label="Population"
						value={settings.population}
						step={10}
						onChange={(population) => update({ population })}
					/>
					<NumberField
						label="Days"
						value={settings.days}
						step={1}
						onChange={(days) => update({ days })}
					/>
					<NumberField
						label="初期睡眠不足率"
						value={settings.initialSleepDeprivedRate}
						step={0.01}
						onChange={(initialSleepDeprivedRate) => update({ initialSleepDeprivedRate })}
					/>
					<NumberField
						label="初期 Sleep Debt (h)"
						value={settings.initialSleepDebtHours}
						step={0.5}
						onChange={(initialSleepDebtHours) => update({ initialSleepDebtHours })}
					/>
					<NumberField
						label="Traffic Level"
						value={settings.trafficLevel}
						step={0.1}
						onChange={(trafficLevel) => update({ trafficLevel })}
					/>
					<div className="space-y-1">
						<Label className="text-xs">Shock Target</Label>
						<Select
							value={settings.shockTarget}
							onValueChange={(value) =>
								update({ shockTarget: value as ExperimentSettings['shockTarget'] })
							}
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
					<div className="space-y-1">
						<Label className="text-xs">Intervention</Label>
						<Select
							value={settings.intervention ?? 'none'}
							onValueChange={(value) =>
								update({
									intervention:
										value === 'none'
											? null
											: (value as NonNullable<ExperimentSettings['intervention']>),
								})
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
					<div className="flex items-end gap-2 pb-1">
						<Switch
							id="settings-ai-decision"
							checked={settings.aiDecisionEnabled}
							onCheckedChange={(checked) => update({ aiDecisionEnabled: checked })}
						/>
						<Label htmlFor="settings-ai-decision" className="text-xs">
							AI Decision
						</Label>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm">睡眠状態の閾値（Sleep Debt 時間）</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-3 gap-3 p-4 pt-0">
					<NumberField
						label="Tired"
						value={settings.sleepStateThresholds.tired}
						step={0.5}
						onChange={(tired) =>
							update({ sleepStateThresholds: { ...settings.sleepStateThresholds, tired } })
						}
					/>
					<NumberField
						label="Sleep Deprived"
						value={settings.sleepStateThresholds.sleepDeprived}
						step={0.5}
						onChange={(sleepDeprived) =>
							update({ sleepStateThresholds: { ...settings.sleepStateThresholds, sleepDeprived } })
						}
					/>
					<NumberField
						label="Severe"
						value={settings.sleepStateThresholds.severe}
						step={0.5}
						onChange={(severe) =>
							update({ sleepStateThresholds: { ...settings.sleepStateThresholds, severe } })
						}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm">Cascade 判定</CardTitle>
				</CardHeader>
				<CardContent className="grid grid-cols-3 gap-3 p-4 pt-0">
					<NumberField
						label="Rs 閾値"
						value={settings.cascadeThresholds.rsThreshold}
						step={0.1}
						onChange={(rsThreshold) =>
							update({ cascadeThresholds: { ...settings.cascadeThresholds, rsThreshold } })
						}
					/>
					<NumberField
						label="継続 Generation 数"
						value={settings.cascadeThresholds.minGenerations}
						step={1}
						onChange={(minGenerations) =>
							update({ cascadeThresholds: { ...settings.cascadeThresholds, minGenerations } })
						}
					/>
					<NumberField
						label="Reach 比率の下限"
						value={settings.cascadeThresholds.minReachRate}
						step={0.01}
						onChange={(minReachRate) =>
							update({ cascadeThresholds: { ...settings.cascadeThresholds, minReachRate } })
						}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm">AI Model</CardTitle>
				</CardHeader>
				<CardContent className="space-y-1 p-4 pt-0 text-xs">
					<p className="font-mono text-foreground">{currentAiModel}</p>
					<p className="text-muted-foreground">
						API キーをクライアントへ露出させないため、モデルはサーバーの環境変数（
						<code className="rounded bg-muted px-1">AI_MODEL</code>
						）で決めます。ここからは変更できません。 モデルを変えた比較は{' '}
						<code className="rounded bg-muted px-1">scripts/compare-ai-models.ts</code>{' '}
						で実行します。
					</p>
				</CardContent>
			</Card>

			<div className="flex flex-wrap items-center gap-3">
				<Button size="sm" onClick={save} disabled={error !== null}>
					保存
				</Button>
				<Button size="sm" variant="outline" onClick={reset}>
					既定値へ戻す
				</Button>
				{error !== null ? (
					<span className="text-xs text-destructive">{SETTINGS_ERROR_MESSAGES[error]}</span>
				) : saved ? (
					<span className="text-xs text-muted-foreground">
						保存しました。Simulation 画面の「リセット」で反映されます。
					</span>
				) : null}
				<Link href="/" className="ml-auto text-xs underline">
					Simulation へ戻る →
				</Link>
			</div>
		</div>
	);
}

interface NumberFieldProps {
	label: string;
	value: number;
	step: number;
	onChange: (value: number) => void;
}

function NumberField({ label, value, step, onChange }: NumberFieldProps) {
	return (
		<div className="space-y-1">
			<Label className="text-xs">{label}</Label>
			<Input
				type="number"
				step={step}
				value={value}
				onChange={(event) => onChange(Number(event.target.value))}
			/>
		</div>
	);
}
