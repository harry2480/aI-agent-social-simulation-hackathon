import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		globals: true,
		passWithNoTests: true,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov'],
			// Unit テストの対象は domain + application（docs/テストガイドライン.md）。
			// infrastructure は Integration テスト、presentation と frontend は
			// E2E / 手動確認の担当なのでカバレッジ計測の対象外とする
			include: ['src/backend/domain/**/*.ts', 'src/backend/application/**/*.ts'],
			exclude: [
				'src/**/*.d.ts',
				'src/**/*.test.ts',
				// 実行コードを持たない型・interface のみのファイル
				'src/backend/domain/repositories/**',
				'src/backend/domain/gateways/ai-decision.gateway.ts',
				'src/backend/domain/models/metrics.model.ts',
				'src/backend/domain/models/result.model.ts',
			],
		},
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
});
