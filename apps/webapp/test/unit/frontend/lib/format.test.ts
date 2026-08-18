import {
	formatEventLabel,
	formatInteger,
	formatMinutesAsHours,
	formatNumber,
	formatRoleLabel,
} from '@/frontend/lib/format';
import { describe, expect, it } from 'vitest';

describe('formatNumber', () => {
	it('既定は小数 2 桁', () => {
		expect(formatNumber(1.2345)).toBe('1.23');
	});

	it('桁数を指定できる', () => {
		expect(formatNumber(1.2345, 1)).toBe('1.2');
	});

	it('有限でない値は - を返す', () => {
		expect(formatNumber(Number.NaN)).toBe('-');
		expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('-');
	});
});

describe('formatInteger', () => {
	it('四捨五入して桁区切りを付ける', () => {
		expect(formatInteger(1234.6)).toBe('1,235');
	});

	it('有限でない値は - を返す', () => {
		expect(formatInteger(Number.NaN)).toBe('-');
	});
});

describe('formatMinutesAsHours', () => {
	it('分を時間へ変換する', () => {
		expect(formatMinutesAsHours(90)).toBe('1.5 h');
	});

	it('0 分は 0.0 h', () => {
		expect(formatMinutesAsHours(0)).toBe('0.0 h');
	});

	it('有限でない値は - を返す', () => {
		expect(formatMinutesAsHours(Number.NaN)).toBe('-');
	});
});

describe('formatRoleLabel', () => {
	it.each([
		['office_worker', 'Office Worker'],
		['manager', 'Manager'],
		['driver', 'Driver'],
		['delivery_worker', 'Delivery Worker'],
		['store_worker', 'Store Worker'],
	])('%s は %s', (role, label) => {
		expect(formatRoleLabel(role)).toBe(label);
	});

	it('未知の値はそのまま返す', () => {
		expect(formatRoleLabel('unknown_role')).toBe('unknown_role');
	});
});

describe('formatEventLabel', () => {
	it.each([
		['accident', 'Accident'],
		['traffic_jam', 'Traffic Jam'],
		['sleep_opportunity_loss', 'Sleep Opportunity Loss'],
		['severe_sleep_deprived', 'Severe Sleep Deprived'],
	])('%s は %s', (type, label) => {
		expect(formatEventLabel(type)).toBe(label);
	});

	it('未知の値はそのまま返す', () => {
		expect(formatEventLabel('unknown_event')).toBe('unknown_event');
	});
});
