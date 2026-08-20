import { PrismaClient } from '@prisma-client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

/**
 * Prisma 7 では接続 URL を Client 側の Driver Adapter へ渡す。
 * Migrate 用の直結 URL は prisma.config.ts が持ち、アプリは Pooler 経由の DATABASE_URL を使う。
 */
function createPrismaClient(): PrismaClient {
	const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
	return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = prisma;
}
