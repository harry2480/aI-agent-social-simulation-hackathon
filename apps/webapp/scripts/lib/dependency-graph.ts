/**
 * dependency-cruiser の出力を検証する。
 *
 * dependency-cruiser は TypeScript のコンパイラを見つけられないと 0 modules のまま
 * 「違反なし」で正常終了する（TypeScript 7 へ上げたときに実際に起きた）。
 * 依存方向チェックが黙って無効化されるのを防ぐため、解析件数も条件にする。
 */

/** src 配下のモジュール数の下限。構成変更で減っても気づける程度に緩く置く */
export const MIN_MODULES = 50;

export interface CruiseResult {
	summary?: {
		totalCruised?: number;
		error?: number;
		warn?: number;
		violations?: { rule?: { name?: string }; from?: string; to?: string }[];
	};
}

export interface CruiseVerdict {
	ok: boolean;
	/** 標準出力・標準エラーへ出す行。ok なら 1 行、失敗なら理由を列挙する */
	messages: string[];
}

/** depcruise の出力を JSON として読む。読めない場合は null */
export function parseCruiseOutput(raw: string): CruiseResult | null {
	try {
		return JSON.parse(raw) as CruiseResult;
	} catch {
		return null;
	}
}

/**
 * 違反の有無と解析件数の両方を見る。
 * 違反があればそれを優先して報告し、無ければ解析件数を確かめる。
 */
export function evaluateCruiseResult(result: CruiseResult): CruiseVerdict {
	const summary = result.summary ?? {};
	const totalCruised = summary.totalCruised ?? 0;
	const violations = summary.violations ?? [];

	if (violations.length > 0) {
		return {
			ok: false,
			messages: [
				`[depcruise] 依存方向の違反が ${violations.length} 件あります`,
				...violations.map(
					(violation) => `  ${violation.rule?.name}: ${violation.from} → ${violation.to}`,
				),
			],
		};
	}

	if (totalCruised < MIN_MODULES) {
		return {
			ok: false,
			messages: [
				`[depcruise] 解析できたモジュールが ${totalCruised} 件しかありません（下限 ${MIN_MODULES}）。TypeScript のバージョンが dependency-cruiser の対応範囲外の可能性があります`,
			],
		};
	}

	return { ok: true, messages: [`[depcruise] 違反なし（${totalCruised} modules）`] };
}
