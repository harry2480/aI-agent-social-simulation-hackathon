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
			// src 全体を対象とし、Unit テストで到達できないものだけを除外する
			include: ['src/**/*.ts', 'src/**/*.tsx'],
			exclude: [
				'src/**/*.d.ts',
				'src/**/*.test.ts',
				// 実行コードを持たない型・interface のみのファイル
				'src/backend/domain/repositories/**',
				'src/backend/domain/gateways/ai-decision.gateway.ts',
				'src/backend/domain/models/metrics.model.ts',
				'src/backend/domain/models/result.model.ts',
				// DB 接続が必要。Integration テストの担当（docs/テストガイドライン.md）
				'src/backend/infrastructure/db/**',
				// マッパーは Prisma に依存しない純粋な変換なので Unit テストの担当
				'src/backend/infrastructure/repositories/prisma-*.repository.ts',
				'src/backend/presentation/composition/simulation.composition.ts',
				'src/backend/presentation/loaders/**',
				'src/backend/presentation/actions/**',
				// ブラウザ描画が必要。E2E の担当
				'src/app/**',
				'src/frontend/components/**',
				'src/frontend/hooks/**',
			],
		},
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			'@prisma-client': path.resolve(__dirname, './prisma/generated/prisma/client'),
		},
	},
});
