import type { RunSummary } from '@/backend/domain/models/metrics.model';
import { describe, expect, it } from 'vitest';
import {
	aggregateSummaries,
	argValue,
	averageDampingGeneration,
	formatAggregateLine,
	parseSeeds,
	standardDeviation,
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

describe('standardDeviation', () => {
	it('母集団の標準偏差を返す', () => {
		expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 10);
	});

	it('ばらつきが無ければ 0', () => {
		expect(standardDeviation([3, 3, 3])).toBe(0);
	});

	it('空配列でも NaN にせず 0 を返す', () => {
		expect(standardDeviation([])).toBe(0);
	});
});

describe('averageDampingGeneration', () => {
	it('収束した Run だけの平均を取る', () => {
		// 一度も閾値を超えなかった Run は「収束する山が無かった」ため対象から除く
		const summaries = [
			summary({ dampingGeneration: 2 }),
			summary({ dampingGeneration: 4 }),
			summary({ dampingGeneration: null }),
		];

		expect(averageDampingGeneration(summaries)).toBe(3);
	});

	it('どの Run も閾値を超えなければ null', () => {
		expect(averageDampingGeneration([summary(), summary()])).toBeNull();
	});

	it('世代 0 を「収束しなかった」と取り違えない', () => {
		expect(averageDampingGeneration([summary({ dampingGeneration: 0 })])).toBe(0);
	});
});

describe('aggregateSummaries', () => {
	it('Cascade と Outbreak の発生率を別々に数える', () => {
		// Cascade 判定は成立しないが一度大きく広がる条件を取りこぼさないため
		const summaries = [
			summary({ cascadeOccurred: true, outbreakOccurred: true }),
			summary({ cascadeOccurred: false, outbreakOccurred: true }),
			summary({ cascadeOccurred: false, outbreakOccurred: false }),
			summary({ cascadeOccurred: false, outbreakOccurred: false }),
		];

		const aggregate = aggregateSummaries('driver-shock', summaries);

		expect(aggregate.cascadeProbability).toBe(0.25);
		expect(aggregate.outbreakProbability).toBe(0.5);
	});

	it('Rs は平均と Peak を分けて持つ', () => {
		const summaries = [summary({ averageRs: 1, peakRs: 2 }), summary({ averageRs: 2, peakRs: 5 })];

		const aggregate = aggregateSummaries('label', summaries);

		expect(aggregate.averageRs).toBe(1.5);
		// Peak は Run をまたいだ最大値。平均すると尖りが消える
		expect(aggregate.peakRs).toBe(5);
	});

	it('Cascade Reach は平均と標準偏差を併記する', () => {
		const summaries = [
			summary({ cascadeReach: 10 }),
			summary({ cascadeReach: 20 }),
			summary({ cascadeReach: 30 }),
		];

		const aggregate = aggregateSummaries('label', summaries);

		expect(aggregate.averageReach).toBe(20);
		expect(aggregate.standardDeviation).toBeCloseTo(8.16496580927726, 10);
	});

	it('Sleep Loss は合計ではなく Run あたりの平均を入れる', () => {
		// フィールド名は totalSleepLossMinutes だが、Seed 数が違う条件を並べるため平均で持つ
		const summaries = [
			summary({ totalSleepLossMinutes: 100 }),
			summary({ totalSleepLossMinutes: 300 }),
		];

		expect(aggregateSummaries('label', summaries).totalSleepLossMinutes).toBe(200);
	});

	it('ラベルと Run 数をそのまま持つ', () => {
		const aggregate = aggregateSummaries('mandatory-rest', [summary(), summary()]);

		expect(aggregate.label).toBe('mandatory-rest');
		expect(aggregate.runCount).toBe(2);
	});

	it('Run が 0 本なら例外にする', () => {
		// 平均が NaN、Peak Rs が -Infinity のまま DB へ入るのを防ぐ
		expect(() => aggregateSummaries('baseline', [])).toThrow('Run が 1 本もありません');
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
