import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

dotenv.config({ path: '.env.local' });
dotenv.config();

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations',
		seed: 'tsx prisma/seed.ts',
	},
	datasource: {
		// Migrate は Connection Pooler を経由できないため直結 URL を優先する（Supabase）
		url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
	},
});
