import { readJsonBody } from '@/app/api/json-body';
import { describe, expect, it } from 'vitest';

function postRequest(body: string): Request {
	return new Request('http://localhost/api/experiments', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body,
	});
}

describe('readJsonBody', () => {
	it('正しい JSON はそのまま返す', async () => {
		await expect(readJsonBody(postRequest('{"kind":"critical-point"}'))).resolves.toEqual({
			kind: 'critical-point',
		});
	});

	it('壊れた JSON は undefined を返す。例外のままだと 400 ではなく 500 になる', async () => {
		await expect(readJsonBody(postRequest('{'))).resolves.toBeUndefined();
	});

	it('本文が空でも undefined を返す', async () => {
		await expect(readJsonBody(postRequest(''))).resolves.toBeUndefined();
	});

	it('JSON の null はそのまま返し、入力検証側で弾かせる', async () => {
		// JSON は undefined を表現できないため、壊れた本文と正常な本文を取り違えることはない
		await expect(readJsonBody(postRequest('null'))).resolves.toBeNull();
	});
});
