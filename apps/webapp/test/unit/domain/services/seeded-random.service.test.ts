import { SeededRandomService } from '@/backend/domain/services/seeded-random.service';
import { describe, expect, it } from 'vitest';

describe('SeededRandomService', () => {
	it('同じ Seed なら同じ系列を返す', () => {
		const a = new SeededRandomService(42);
		const b = new SeededRandomService(42);
		const seriesA = Array.from({ length: 20 }, () => a.next());
		const seriesB = Array.from({ length: 20 }, () => b.next());
		expect(seriesA).toEqual(seriesB);
	});

	it('異なる Seed では異なる系列になる', () => {
		const a = new SeededRandomService(42);
		const b = new SeededRandomService(43);
		expect(a.next()).not.toBe(b.next());
	});

	it('next は 0 以上 1 未満を返す', () => {
		const rng = new SeededRandomService(7);
		for (let i = 0; i < 500; i++) {
			const value = rng.next();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});

	it('用途別ストリームは同じ Seed でも互いに独立する', () => {
		const cityStream = SeededRandomService.forStream(42, 'city');
		const shockStream = SeededRandomService.forStream(42, 'shock');
		expect(cityStream.next()).not.toBe(shockStream.next());
	});

	it('用途別ストリームは Seed と名前が同じなら再現する', () => {
		const first = SeededRandomService.forStream(42, 'accident');
		const second = SeededRandomService.forStream(42, 'accident');
		expect(first.next()).toBe(second.next());
	});

	it('shuffle は元配列を変更しない', () => {
		const rng = new SeededRandomService(1);
		const original = [1, 2, 3, 4, 5];
		const shuffled = rng.shuffle(original);
		expect(original).toEqual([1, 2, 3, 4, 5]);
		expect([...shuffled].sort()).toEqual(original);
	});

	it('nextInt は下限を含み上限を含まない', () => {
		const rng = new SeededRandomService(3);
		for (let i = 0; i < 200; i++) {
			const value = rng.nextInt(0, 3);
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(3);
		}
	});
});
