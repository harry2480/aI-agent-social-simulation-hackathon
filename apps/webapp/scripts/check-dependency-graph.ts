/**
 * dependency-cruiser の結果を検証する。
 *
 * 判定そのものは scripts/lib/dependency-graph.ts にあり、ここは標準入力の読み取りと
 * 終了コードの制御だけを担う。
 *
 * 使い方: depcruise src --config .dependency-cruiser.cjs --output-type json | tsx scripts/check-dependency-graph.ts
 */
import { evaluateCruiseResult, parseCruiseOutput } from './lib/dependency-graph';

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
	const result = parseCruiseOutput(await readStdin());
	if (result === null) {
		console.error('[depcruise] 出力を JSON として読めませんでした');
		process.exit(1);
	}

	const verdict = evaluateCruiseResult(result);
	for (const message of verdict.messages) {
		if (verdict.ok) {
			console.log(message);
		} else {
			console.error(message);
		}
	}
	if (!verdict.ok) {
		process.exit(1);
	}
}

void main();
