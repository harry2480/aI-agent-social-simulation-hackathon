import {
	type EventOrigin,
	type EventType,
	originOfEventType,
} from '@/backend/presentation/composition/watch-mode-engine.composition';

/** Event の由来を画面へ出すための表示定義 */
export interface EventOriginPresentation {
	label: string;
	/** 何が決めたのかを一言で説明する。ツールチップ用 */
	description: string;
	textClass: string;
	/** 色だけに頼らず形状でも区別するためのマーカー記号（docs/スタイルガイド.md） */
	marker: string;
	/** Causal Graph のノード枠線。色覚特性に依存せず由来を判別できるようにする */
	graphBorderStyle: 'solid' | 'dashed' | 'dotted';
}

/**
 * Event の由来（AI 判断 / 確率抽選 / 決定論的計算）の表示定義。
 *
 * AI が担当するのは行動の選択だけで、事故そのものは Simulation Engine の確率抽選で決まる。
 * この区別を UI に出さないと「AI が事故を起こした」と誤読されるため、
 * Timeline と Causal Graph が同じ定義を参照する。
 */
const PRESENTATIONS: Record<EventOrigin, EventOriginPresentation> = {
	ai_decision: {
		label: 'AI 判断',
		description: 'AI Agent が選んだ行動',
		textClass: 'text-primary',
		marker: '◇',
		graphBorderStyle: 'dashed',
	},
	probabilistic: {
		label: '確率',
		description: 'Simulation Engine の確率抽選で発生',
		textClass: 'text-alert',
		marker: '△',
		graphBorderStyle: 'dotted',
	},
	deterministic: {
		label: '計算',
		description: '遅延・睡眠時間の計算結果として発生',
		textClass: 'text-muted-foreground',
		marker: '□',
		graphBorderStyle: 'solid',
	},
};

export const EVENT_ORIGIN_ORDER: EventOrigin[] = ['ai_decision', 'probabilistic', 'deterministic'];

/** 由来から表示定義を引く */
export function eventOriginPresentation(origin: EventOrigin): EventOriginPresentation {
	return PRESENTATIONS[origin];
}

/** Event 種別から表示定義を引く。呼び出し側が由来を意識しなくて済む */
export function eventTypePresentation(type: EventType): EventOriginPresentation {
	return PRESENTATIONS[originOfEventType(type)];
}
