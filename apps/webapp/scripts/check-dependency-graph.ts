/**
 * dependency-cruiser の結果を検証する。
 *
 * dependency-cruiser は TypeScript のコンパイラを見つけられないと 0 modules のまま
 * 「違反なし」で正常終了する（TypeScript 7 へ上げたときに実際に起きた）。
 * 依存方向チェックが黙って無効化されるのを防ぐため、解析件数も条件にする。
 *
 * 使い方: depcruise src --config .dependency-cruiser.cjs --output-type json | tsx scripts/check-dependency-graph.ts
 */

/** src 配下のモジュール数の下限。構成変更で減っても気づける程度に緩く置く */
const MIN_MODULES = 50;

interface CruiseResult {
	summary?: {
		totalCruised?: number;
		error?: number;
		warn?: number;
		violations?: { rule?: { name?: string }; from?: string; to?: string }[];
	};
}

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
	const raw = await readStdin();
	let result: CruiseResult;
	try {
		result = JSON.parse(raw) as CruiseResult;
	} catch {
		console.error('[depcruise] 出力を JSON として読めませんでした');
		process.exit(1);
	}

	const summary = result.summary ?? {};
	const totalCruised = summary.totalCruised ?? 0;
	const violations = summary.violations ?? [];

	if (violations.length > 0) {
		console.error(`[depcruise] 依存方向の違反が ${violations.length} 件あります`);
		for (const violation of violations) {
			console.error(`  ${violation.rule?.name}: ${violation.from} → ${violation.to}`);
		}
		process.exit(1);
	}

	if (totalCruised < MIN_MODULES) {
		console.error(
			`[depcruise] 解析できたモジュールが ${totalCruised} 件しかありません（下限 ${MIN_MODULES}）。TypeScript のバージョンが dependency-cruiser の対応範囲外の可能性があります`,
		);
		process.exit(1);
	}

	console.log(`[depcruise] 違反なし（${totalCruised} modules）`);
}

void main();
