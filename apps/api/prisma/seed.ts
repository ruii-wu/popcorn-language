import { PrismaClient } from '@prisma/client';
import { NPCS, SCENARIO_TEMPLATES, ACHIEVEMENTS } from './seed-data';
import { seedBaseData } from './seed-base';

const prisma = new PrismaClient();

async function main() {
  await seedBaseData(prisma);
  console.log(`Seeded ${NPCS.length} NPCs, ${SCENARIO_TEMPLATES.length} scenario(s), ${ACHIEVEMENTS.length} achievements.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
