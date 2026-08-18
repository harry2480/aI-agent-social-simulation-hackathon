import { cn } from '@/lib/utils';
import { describe, expect, it } from 'vitest';

describe('cn', () => {
	it('複数のクラス名を連結する', () => {
		expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
	});

	it('falsy な値を除外する', () => {
		expect(cn('px-2', false, undefined, null, 'py-1')).toBe('px-2 py-1');
	});

	it('条件付きクラスを扱える', () => {
		expect(cn('base', { active: true, disabled: false })).toBe('base active');
	});

	it('後勝ちで Tailwind の競合クラスをマージする', () => {
		expect(cn('px-2', 'px-4')).toBe('px-4');
		expect(cn('text-sm text-muted-foreground', 'text-lg')).toBe('text-muted-foreground text-lg');
	});

	it('引数なしなら空文字', () => {
		expect(cn()).toBe('');
	});
});
