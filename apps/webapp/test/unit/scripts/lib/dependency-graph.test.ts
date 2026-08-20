import { describe, expect, it } from 'vitest';
import {
	type CruiseResult,
	MIN_MODULES,
	evaluateCruiseResult,
	parseCruiseOutput,
} from '../../../../scripts/lib/dependency-graph';

function result(overrides: CruiseResult['summary'] = {}): CruiseResult {
	return { summary: { totalCruised: MIN_MODULES, violations: [], ...overrides } };
}

describe('parseCruiseOutput', () => {
	it('JSON を読む', () => {
		expect(parseCruiseOutput('{"summary":{"totalCruised":100}}')).toEqual({
			summary: { totalCruised: 100 },
		});
	});

	it('JSON でなければ null を返す', () => {
		// depcruise が異常終了して JSON 以外を吐いたケース
		expect(parseCruiseOutput('depcruise: command not found')).toBeNull();
		expect(parseCruiseOutput('')).toBeNull();
	});
});

describe('evaluateCruiseResult', () => {
	it('違反が無く十分なモジュール数なら通す', () => {
		const verdict = evaluateCruiseResult(result({ totalCruised: 150 }));

		expect(verdict.ok).toBe(true);
		expect(verdict.messages).toEqual(['[depcruise] 違反なし（150 modules）']);
	});

	it('違反があれば落とし、違反ごとに経路を出す', () => {
		const verdict = evaluateCruiseResult(
			result({
				totalCruised: 150,
				violations: [
					{
						rule: { name: 'domain-no-depend-on-outer-layers' },
						from: 'src/backend/domain/a.ts',
						to: 'src/backend/infrastructure/b.ts',
					},
				],
			}),
		);

		expect(verdict.ok).toBe(false);
		expect(verdict.messages[0]).toContain('1 件');
		expect(verdict.messages[1]).toContain('domain-no-depend-on-outer-layers');
		expect(verdict.messages[1]).toContain('src/backend/domain/a.ts');
	});

	it('解析件数が下限に満たなければ落とす', () => {
		// dependency-cruiser が TypeScript を見つけられないと 0 modules のまま成功する。
		// 依存方向チェックが黙って無効化されるのを防ぐための条件
		const verdict = evaluateCruiseResult(result({ totalCruised: 0 }));

		expect(verdict.ok).toBe(false);
		expect(verdict.messages[0]).toContain('0 件');
		expect(verdict.messages[0]).toContain('TypeScript');
	});

	it('下限ちょうどは通す', () => {
		expect(evaluateCruiseResult(result({ totalCruised: MIN_MODULES })).ok).toBe(true);
		expect(evaluateCruiseResult(result({ totalCruised: MIN_MODULES - 1 })).ok).toBe(false);
	});

	it('違反があるときは解析件数より違反を優先して報告する', () => {
		// 0 modules で違反が出ることは無いが、報告が入れ替わらないことを固定しておく
		const verdict = evaluateCruiseResult(
			result({ totalCruised: 0, violations: [{ rule: { name: 'r' }, from: 'a', to: 'b' }] }),
		);

		expect(verdict.messages[0]).toContain('依存方向の違反');
	});

	it('summary が無い出力は解析 0 件として落とす', () => {
		// 「summary が無い＝違反も無い」と読むと、壊れた出力で素通りする
		expect(evaluateCruiseResult({}).ok).toBe(false);
	});
});
