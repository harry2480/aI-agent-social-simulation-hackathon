/**
 * Seed 付き擬似乱数生成器（mulberry32）。
 * Simulation の再現性を担保するため、domain 層では Math.random() を使わず必ずこのサービスを使う。
 * 用途ごとに独立ストリームを持たせることで、機能追加時に過去 Run の再現性が壊れるのを防ぐ。
 */
export class SeededRandomService {
	private state: number;

	constructor(seed: number) {
		this.state = seed | 0;
	}

	/** 用途別の独立ストリームを生成する（例: 'agent-generation', 'accident'） */
	static forStream(seed: number, streamName: string): SeededRandomService {
		return new SeededRandomService(SeededRandomService.mixSeed(seed, streamName));
	}

	/** [0, 1) の乱数 */
	next(): number {
		this.state = (this.state + 0x6d2b79f5) | 0;
		let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	/** [min, max) の整数 */
	nextInt(minInclusive: number, maxExclusive: number): number {
		return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
	}

	/** [min, max] の実数 */
	nextFloat(min: number, max: number): number {
		return min + this.next() * (max - min);
	}

	/** 確率 probability(0〜1) で true */
	bool(probability: number): boolean {
		return this.next() < probability;
	}

	pick<T>(items: readonly T[]): T {
		if (items.length === 0) {
			throw new Error('SeededRandomService.pick: items is empty');
		}
		return items[this.nextInt(0, items.length)] as T;
	}

	/** Fisher-Yates。元配列は変更しない */
	shuffle<T>(items: readonly T[]): T[] {
		const result = [...items];
		for (let i = result.length - 1; i > 0; i--) {
			const j = this.nextInt(0, i + 1);
			const a = result[i] as T;
			const b = result[j] as T;
			result[i] = b;
			result[j] = a;
		}
		return result;
	}

	/** 現在の状態から派生した子ストリームを生成する */
	fork(streamName: string): SeededRandomService {
		return new SeededRandomService(SeededRandomService.mixSeed(this.state, streamName));
	}

	private static mixSeed(seed: number, streamName: string): number {
		let hash = seed | 0;
		for (let i = 0; i < streamName.length; i++) {
			hash = Math.imul(hash ^ streamName.charCodeAt(i), 0x01000193) | 0;
		}
		return hash;
	}
}
