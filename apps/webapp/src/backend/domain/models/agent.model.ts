import type { SeededRandomService } from '../services/seeded-random.service';
import {
	type SleepStateName,
	type SleepStateThresholds,
	isSleepDeprivedState,
	sleepStateFrom,
} from './sleep-state.model';

export type AgentRole = 'office_worker' | 'manager' | 'driver' | 'delivery_worker' | 'store_worker';

export type AgentActionName =
	| 'sleeping'
	| 'morning_routine'
	| 'commuting'
	| 'working'
	| 'overtime'
	| 'driving'
	| 'delivering'
	| 'resting'
	| 'shopping'
	| 'housework'
	| 'idle';

export interface AgentDecisionRecord {
	action: string;
	reason: string;
	model: string;
	tick: number;
}

const FATIGUE_MIN = 0;
const FATIGUE_MAX = 100;
const STRESS_MIN = 0;
const STRESS_MAX = 100;
const SLEEP_NEED_MIN_HOURS = 6.5;
const SLEEP_NEED_MAX_HOURS = 8.5;

/**
 * 都市の住民。Rich Domain Model として属性の生成・検証・更新を自身の責務とする。
 * Simulation 中に状態が変化するため可変エンティティとして扱うが、
 * 値の更新は必ずメソッド経由とし、不変条件（範囲）をメソッド内で強制する。
 */
export class Agent {
	private _currentLocationId: string;
	private _sleepDebtHours: number;
	private _fatigue: number;
	private _stress: number;
	private _workPressure: number;
	private _currentAction: AgentActionName;
	private _sleepMinutesThisNight: number;
	private _lastDecision: AgentDecisionRecord | undefined;
	private _lastSleepStateName: SleepStateName;

	private constructor(
		public readonly id: string,
		public readonly role: AgentRole,
		public readonly homeId: string,
		public readonly workplaceId: string | undefined,
		/** 必要睡眠時間（時間） */
		public readonly sleepNeedHours: number,
		public readonly responsibility: number,
		public readonly riskTolerance: number,
		public readonly cooperativeness: number,
		public readonly familyResponsibility: number,
		params: {
			currentLocationId: string;
			sleepDebtHours: number;
			fatigue: number;
			stress: number;
			workPressure: number;
			currentAction: AgentActionName;
			sleepMinutesThisNight: number;
			lastDecision?: AgentDecisionRecord;
			lastSleepStateName: SleepStateName;
		},
	) {
		this._currentLocationId = params.currentLocationId;
		this._sleepDebtHours = params.sleepDebtHours;
		this._fatigue = params.fatigue;
		this._stress = params.stress;
		this._workPressure = params.workPressure;
		this._currentAction = params.currentAction;
		this._sleepMinutesThisNight = params.sleepMinutesThisNight;
		this._lastDecision = params.lastDecision;
		this._lastSleepStateName = params.lastSleepStateName;
	}

	/** Seed 付き乱数から属性を生成する。範囲はここで強制される */
	static create(params: {
		id: string;
		role: AgentRole;
		homeId: string;
		workplaceId?: string;
		rng: SeededRandomService;
		initialSleepDebtHours?: number;
		thresholds: SleepStateThresholds;
	}): Agent {
		const { rng } = params;
		const sleepNeedHours = rng.nextFloat(SLEEP_NEED_MIN_HOURS, SLEEP_NEED_MAX_HOURS);
		const initialSleepDebt = Math.max(0, params.initialSleepDebtHours ?? 0);

		return new Agent(
			params.id,
			params.role,
			params.homeId,
			params.workplaceId,
			sleepNeedHours,
			rng.nextFloat(0.3, 1),
			rng.nextFloat(0, 1),
			rng.nextFloat(0.2, 1),
			rng.nextFloat(0, 1),
			{
				currentLocationId: params.homeId,
				sleepDebtHours: initialSleepDebt,
				fatigue: Math.min(FATIGUE_MAX, initialSleepDebt * 8),
				stress: 0,
				workPressure: rng.nextFloat(0.2, 0.8),
				currentAction: 'sleeping',
				sleepMinutesThisNight: 0,
				lastSleepStateName: sleepStateFrom(initialSleepDebt, params.thresholds),
			},
		);
	}

	static reconstruct(params: {
		id: string;
		role: AgentRole;
		homeId: string;
		workplaceId?: string;
		sleepNeedHours: number;
		responsibility: number;
		riskTolerance: number;
		cooperativeness: number;
		familyResponsibility: number;
		currentLocationId: string;
		sleepDebtHours: number;
		fatigue: number;
		stress: number;
		workPressure: number;
		currentAction: AgentActionName;
		sleepMinutesThisNight: number;
		lastDecision?: AgentDecisionRecord;
		lastSleepStateName: SleepStateName;
	}): Agent {
		return new Agent(
			params.id,
			params.role,
			params.homeId,
			params.workplaceId,
			params.sleepNeedHours,
			params.responsibility,
			params.riskTolerance,
			params.cooperativeness,
			params.familyResponsibility,
			params,
		);
	}

	get currentLocationId(): string {
		return this._currentLocationId;
	}

	get sleepDebtHours(): number {
		return this._sleepDebtHours;
	}

	get fatigue(): number {
		return this._fatigue;
	}

	get stress(): number {
		return this._stress;
	}

	get workPressure(): number {
		return this._workPressure;
	}

	get currentAction(): AgentActionName {
		return this._currentAction;
	}

	get sleepMinutesThisNight(): number {
		return this._sleepMinutesThisNight;
	}

	get lastDecision(): AgentDecisionRecord | undefined {
		return this._lastDecision;
	}

	get lastSleepStateName(): SleepStateName {
		return this._lastSleepStateName;
	}

	/** Parent 属性（家庭責任が高い Agent）かどうか */
	get isParent(): boolean {
		return this.familyResponsibility >= 0.6;
	}

	sleepState(thresholds: SleepStateThresholds): SleepStateName {
		return sleepStateFrom(this._sleepDebtHours, thresholds);
	}

	moveTo(locationId: string): void {
		this._currentLocationId = locationId;
	}

	setAction(action: AgentActionName): void {
		this._currentAction = action;
	}

	addFatigue(delta: number): void {
		this._fatigue = Agent.clamp(this._fatigue + delta, FATIGUE_MIN, FATIGUE_MAX);
	}

	addStress(delta: number): void {
		this._stress = Agent.clamp(this._stress + delta, STRESS_MIN, STRESS_MAX);
	}

	setWorkPressure(value: number): void {
		this._workPressure = Agent.clamp(value, 0, 1);
	}

	recordSleepMinutes(minutes: number): void {
		this._sleepMinutesThisNight += Math.max(0, minutes);
	}

	recordDecision(decision: AgentDecisionRecord): void {
		this._lastDecision = decision;
	}

	/**
	 * 1 晩分の睡眠を Sleep Debt へ反映する。起床時に呼ぶ。
	 * 就寝が 0:00 を跨ぐため、暦日ではなく「1 晩」を単位とする。
	 * Daily Sleep Deficit = max(0, Sleep Need - Actual Sleep)
	 * Sleep Debt(t+1) = Sleep Debt(t) + Deficit - Recovery
	 * 十分な睡眠を取った場合は超過分の recoveryRate 倍を Sleep Debt から回復させる。
	 */
	applyNightSleep(recoveryRate: number): { deficitHours: number; recoveredHours: number } {
		const actualSleepHours = this._sleepMinutesThisNight / 60;
		const diff = this.sleepNeedHours - actualSleepHours;
		let deficitHours = 0;
		let recoveredHours = 0;

		if (diff > 0) {
			deficitHours = diff;
			this._sleepDebtHours += diff;
		} else {
			recoveredHours = Math.min(this._sleepDebtHours, -diff * recoveryRate);
			this._sleepDebtHours -= recoveredHours;
		}

		this._sleepDebtHours = Math.max(0, this._sleepDebtHours);
		this._sleepMinutesThisNight = 0;
		return { deficitHours, recoveredHours };
	}

	/** 他 Agent 由来の睡眠機会損失を直接 Sleep Debt へ加算する */
	addSleepDebtHours(hours: number): void {
		this._sleepDebtHours = Math.max(0, this._sleepDebtHours + hours);
	}

	/**
	 * 睡眠状態の遷移を確定し、前回状態を更新する。
	 * Normal / Tired から Sleep Deprived 以上へ遷移した場合に true を返す（New Sleep-Deprived Case）。
	 */
	commitSleepStateTransition(thresholds: SleepStateThresholds): boolean {
		const previous = this._lastSleepStateName;
		const current = this.sleepState(thresholds);
		this._lastSleepStateName = current;
		return !isSleepDeprivedState(previous) && isSleepDeprivedState(current);
	}

	private static clamp(value: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, value));
	}
}
