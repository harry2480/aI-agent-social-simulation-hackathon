import {
	EVENT_ORIGIN_ORDER,
	eventOriginPresentation,
	eventTypePresentation,
} from '@/frontend/lib/event-origin-presentation';
import { describe, expect, it } from 'vitest';

describe('eventTypePresentation', () => {
	it('AI が選んだ行動は AI 判断として表示する', () => {
		expect(eventTypePresentation('decision').label).toBe('AI 判断');
	});

	it('事故と作業ミスは確率イベントとして表示する', () => {
		expect(eventTypePresentation('accident').label).toBe('確率');
		expect(eventTypePresentation('work_failure').label).toBe('確率');
	});

	it('遅延や睡眠損失は計算結果として表示する', () => {
		expect(eventTypePresentation('commute_delay').label).toBe('計算');
		expect(eventTypePresentation('sleep_loss').label).toBe('計算');
		// 事故の後に必ず起きるため、渋滞自体は抽選ではない
		expect(eventTypePresentation('traffic_jam').label).toBe('計算');
	});
});

describe('eventOriginPresentation', () => {
	it('由来ごとにマーカーと枠線が重複しない', () => {
		const markers = EVENT_ORIGIN_ORDER.map((origin) => eventOriginPresentation(origin).marker);
		const borders = EVENT_ORIGIN_ORDER.map(
			(origin) => eventOriginPresentation(origin).graphBorderStyle,
		);
		// 色だけに頼らず区別できることが要件（docs/スタイルガイド.md）
		expect(new Set(markers).size).toBe(EVENT_ORIGIN_ORDER.length);
		expect(new Set(borders).size).toBe(EVENT_ORIGIN_ORDER.length);
	});
});
