import type { SleepStateName } from '@/backend/presentation/composition/watch-mode-engine.composition';

export interface SleepStatePresentation {
	label: string;
	/** CSS 変数名。Canvas 描画時は getComputedStyle 経由で解決する */
	colorVar: string;
	textClass: string;
	bgClass: string;
	/** 色だけに頼らず形状でも区別するためのマーカー記号 */
	marker: string;
}

/**
 * 睡眠状態の表示定義を 1 箇所に集約する。
 * City Map / KPI / Timeline / Agent Detail が同じ定義を参照することで、
 * 画面ごとに色や表記がずれるのを防ぐ。
 */
const PRESENTATIONS: Record<SleepStateName, SleepStatePresentation> = {
	normal: {
		label: 'Normal',
		colorVar: '--color-sleep-normal',
		textClass: 'text-sleep-normal',
		bgClass: 'bg-sleep-normal',
		marker: '●',
	},
	tired: {
		label: 'Tired',
		colorVar: '--color-sleep-tired',
		textClass: 'text-sleep-tired',
		bgClass: 'bg-sleep-tired',
		marker: '◆',
	},
	sleep_deprived: {
		label: 'Sleep Deprived',
		colorVar: '--color-sleep-deprived',
		textClass: 'text-sleep-deprived',
		bgClass: 'bg-sleep-deprived',
		marker: '▲',
	},
	severe_sleep_deprived: {
		label: 'Severe',
		colorVar: '--color-sleep-severe',
		textClass: 'text-sleep-severe',
		bgClass: 'bg-sleep-severe',
		marker: '■',
	},
};

export const SLEEP_STATE_ORDER: SleepStateName[] = [
	'normal',
	'tired',
	'sleep_deprived',
	'severe_sleep_deprived',
];

export function sleepStatePresentation(state: SleepStateName): SleepStatePresentation {
	return PRESENTATIONS[state];
}

/** 睡眠状態ごとの CSS 変数名。Canvas 描画側が実際の色へ解決するために使う */
export function sleepStateColorVars(): Record<SleepStateName, string> {
	const vars = {} as Record<SleepStateName, string>;
	for (const state of SLEEP_STATE_ORDER) {
		vars[state] = PRESENTATIONS[state].colorVar;
	}
	return vars;
}
