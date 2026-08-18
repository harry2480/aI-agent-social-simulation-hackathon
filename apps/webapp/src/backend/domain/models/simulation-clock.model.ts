/** 1 Tick = 15 分 */
export const MINUTES_PER_TICK = 15;
export const TICKS_PER_HOUR = 4;
export const TICKS_PER_DAY = 96;

/**
 * Simulation 内の時刻。domain 層では Date.now() を使わず必ず Clock から時刻を取得する。
 * 不変オブジェクトとして扱い、advance() は新しいインスタンスを返す。
 */
export class SimulationClock {
	private constructor(public readonly tick: number) {}

	static start(): SimulationClock {
		return new SimulationClock(0);
	}

	static fromTick(tick: number): SimulationClock {
		if (!Number.isInteger(tick) || tick < 0) {
			throw new Error(`SimulationClock: tick must be a non-negative integer, got ${tick}`);
		}
		return new SimulationClock(tick);
	}

	advance(): SimulationClock {
		return new SimulationClock(this.tick + 1);
	}

	/** 0 始まりの経過日数 */
	get day(): number {
		return Math.floor(this.tick / TICKS_PER_DAY);
	}

	get hour(): number {
		return Math.floor((this.tick % TICKS_PER_DAY) / TICKS_PER_HOUR);
	}

	get minute(): number {
		return (this.tick % TICKS_PER_HOUR) * MINUTES_PER_TICK;
	}

	/** その日の 0:00 からの経過分 */
	get minutesOfDay(): number {
		return this.hour * 60 + this.minute;
	}

	/** 日の最終 Tick（23:45）かどうか。日次処理のトリガーに使う */
	get isEndOfDay(): boolean {
		return this.tick % TICKS_PER_DAY === TICKS_PER_DAY - 1;
	}

	format(): string {
		const hh = String(this.hour).padStart(2, '0');
		const mm = String(this.minute).padStart(2, '0');
		return `Day ${this.day + 1} ${hh}:${mm}`;
	}
}
