/**
 * リクエスト本文を JSON として読む。
 *
 * `Request.json()` は構文エラーで例外を投げ、Route Handler がそのまま 500 を返す。
 * 壊れた本文は送信側の誤りであり、型が合わない本文と区別する意味が無いため、
 * ここで undefined へ倒して各ルートの入力検証（400）に合流させる。
 * JSON は undefined を表現できないため、正常な本文と取り違えることはない。
 */
export async function readJsonBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return undefined;
	}
}
