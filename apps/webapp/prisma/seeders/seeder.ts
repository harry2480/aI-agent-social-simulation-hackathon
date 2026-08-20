import type { PrismaClient } from '../generated/prisma/client';

export interface Seeder {
	name: string;
	run(prisma: PrismaClient): Promise<void>;
}
