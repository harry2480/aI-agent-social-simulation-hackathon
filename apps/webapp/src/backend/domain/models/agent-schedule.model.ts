import type { AgentRole } from './agent.model';
import { TICKS_PER_HOUR } from './simulation-clock.model';

/** その日の予定。tick はいずれも「その日の 0:00 起点の tick-of-day」 */
export interface DaySchedule {
	wakeTickOfDay: number;
	departForWorkTickOfDay: number;
	workStartTickOfDay: number;
	/** 残業や遅刻補填で後ろへずれる。基準値 */
	workEndTickOfDay: number;
}

const ROLE_SCHEDULE: Record<AgentRole, { workStartHour: number; workEndHour: number }> = {
	office_worker: { workStartHour: 9, workEndHour: 18 },
	// Manager は部下と同じ終業時刻とする。
	// 部下より遅い終業にすると、残業要請を判断する時点で部下が既に退勤しており、
	// Work Network を経由した残業伝播が構造的に発生しなくなるため
	manager: { workStartHour: 9, workEndHour: 18 },
	driver: { workStartHour: 6, workEndHour: 15 },
	delivery_worker: { workStartHour: 8, workEndHour: 17 },
	store_worker: { workStartHour: 10, workEndHour: 19 },
};

/** 起床から出発までの朝の支度 */
const MORNING_ROUTINE_TICKS = 2;
/** 習慣的な就寝時刻の上限（23:00）。これより遅く寝るのは予定外の遅延によるものとみなす */
const HABITUAL_BED_HOUR = 23;

export function scheduleForRole(role: AgentRole, commuteTicks: number): DaySchedule {
	const { workStartHour, workEndHour } = ROLE_SCHEDULE[role];
	const workStartTickOfDay = workStartHour * TICKS_PER_HOUR;
	const departForWorkTickOfDay = Math.max(0, workStartTickOfDay - commuteTicks);
	const wakeTickOfDay = Math.max(0, departForWorkTickOfDay - MORNING_ROUTINE_TICKS);

	return {
		wakeTickOfDay,
		departForWorkTickOfDay,
		workStartTickOfDay,
		workEndTickOfDay: workEndHour * TICKS_PER_HOUR,
	};
}

/**
 * 予定就寝 tick を決める。
 *
 * 「習慣的な就寝時刻（23:00）」と「翌朝の起床 tick − 必要睡眠時間」の早い方を採る。
 *
 * - 全職種一律 23:00 に固定すると、早番の Driver だけが構造的に睡眠不足になり、
 *   伝播由来の睡眠不足が背景ノイズへ埋もれる
 * - 逆に必要睡眠からの逆算だけにすると、遅番ほど夜の余裕が大きくなり、
 *   遅延がまったく睡眠に効かなくなる
 *
 * 両者の早い方を採ることで、必要睡眠時間が長い Agent ほど余裕が小さく遅延に脆い、
 * という個人差がそのまま伝播のされやすさの差になる。
 */
export function scheduledBedTick(
	dayStartTick: number,
	nextWakeTick: number,
	sleepNeedHours: number,
): number {
	const habitual = dayStartTick + HABITUAL_BED_HOUR * TICKS_PER_HOUR;
	const derived = nextWakeTick - Math.round(sleepNeedHours * TICKS_PER_HOUR);
	return Math.min(habitual, derived);
}
