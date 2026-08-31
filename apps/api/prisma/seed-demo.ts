// prisma/seed-demo.ts — `npm run db:seed:demo` entrypoint.
import { PrismaClient } from '@prisma/client';
import { seedDemo } from './seedDemo';

const prisma = new PrismaClient();
const configuredNow = process.env.DEMO_SEED_NOW;
const now = configuredNow ? new Date(configuredNow) : undefined;
if (now && !Number.isFinite(now.getTime())) {
  throw new Error(`Invalid DEMO_SEED_NOW: ${configuredNow}`);
}

seedDemo(prisma, { now })
  .then(({ userId }) => console.log(`Seeded demo user "demo" (password "demo") — id ${userId}.`))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
