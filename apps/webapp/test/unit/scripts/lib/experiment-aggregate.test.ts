import { aggregateSummaries } from '@/backend/domain/models/experiment-aggregate.model';
import type { RunSummary } from '@/backend/domain/models/metrics.model';
import { describe, expect, it } from 'vitest';
import {
	argValue,
	formatAggregateLine,
	parseSeeds,
} from '../../../../scripts/lib/experiment-aggregate';

function summary(overrides: Partial<RunSummary> = {}): RunSummary {
	return {
		currentRs: 0,
		peakRs: 0,
		averageRs: 0,
		sleepDeprivedPopulation: 0,
		severeSleepDeprivedPopulation: 0,
		totalSleepDebtHours: 0,
		totalSleepLossMinutes: 0,
		cascadeReach: 0,
		cascadeDepth: 0,
		cascadeGeneration: 0,
		accidentCount: 0,
		trafficDelayMinutes: 0,
		overtimeHours: 0,
		averageCommuteDelayMinutes: 0,
		cascadeOccurred: false,
		outbreakOccurred: false,
		dampingGeneration: null,
		...overrides,
	};
}

describe('argValue', () => {
	it('--name=value 形式の値を読む', () => {
		expect(argValue(['--kind=intervention', '--seeds=10'], 'seeds')).toBe('10');
	});

	it('指定されていない引数は undefined を返す', () => {
		expect(argValue(['--kind=intervention'], 'seeds')).toBeUndefined();
	});

	it('前方一致する別の引数を誤って拾わない', () => {
		expect(argValue(['--seeds-per-run=3', '--seeds=10'], 'seeds')).toBe('10');
	});

	it('値に = が含まれても切り詰めない', () => {
		// モデル ID のように値の中へ = が入りうる。先頭の = で切ると
		// 別のモデルを指したまま実験結果が DB へ保存される
		expect(argValue(['--models=vendor=model'], 'models')).toBe('vendor=model');
		expect(argValue(['--kind=a=b=c'], 'kind')).toBe('a=b=c');
	});

	it('値が空でも undefined ではなく空文字を返す', () => {
		// --models= の指定漏れは呼び出し側で「モデル 0 件」として弾く
		expect(argValue(['--models='], 'models')).toBe('');
	});
});
describe('parseSeeds', () => {
	it('未指定なら既定値を使う', () => {
		expect(parseSeeds(undefined, 10)).toBe(10);
	});

	it('1 以上の整数を受け付ける', () => {
		expect(parseSeeds('1', 10)).toBe(1);
		expect(parseSeeds('25', 10)).toBe(25);
	});

	it('0 以下や整数でない値は例外にする', () => {
		// 不正値のまま進むと Run が 1 本も回らず、NaN の集計が DB へ保存される
		for (const raw of ['0', '-1', '2.5', 'abc', '']) {
			expect(() => parseSeeds(raw, 10)).toThrow('1 以上の整数');
		}
	});
});
describe('formatAggregateLine', () => {
	it('実験の種類によらず同じ列で読める 1 行にする', () => {
		const aggregate = aggregateSummaries('driver-shock', [
			summary({ cascadeReach: 12, averageRs: 1.234, peakRs: 3.456, outbreakOccurred: true }),
		]);

		expect(formatAggregateLine(aggregate, 20)).toBe(
			'  driver-shock         reach=12.0 sd=0.0 avgRs=1.23 peakRs=3.46 cascadeP=0% outbreakP=100%',
		);
	});
});
