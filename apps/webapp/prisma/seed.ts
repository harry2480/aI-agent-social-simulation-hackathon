import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import type { Seeder } from './seeders/seeder';

const prisma = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const seeders: Seeder[] = [];

async function main() {
	for (const seeder of seeders) {
		console.log(`[Seed] Running: ${seeder.name}`);
		await seeder.run(prisma);
		console.log(`[Seed] Done: ${seeder.name}`);
	}
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
