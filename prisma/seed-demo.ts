// prisma/seed-demo.ts — `npm run db:seed:demo` entrypoint.
import { PrismaClient } from '@prisma/client';
import { seedDemo } from './seedDemo';

const prisma = new PrismaClient();
seedDemo(prisma)
  .then(({ userId }) => console.log(`Seeded demo user "demo" (password "demo") — id ${userId}.`))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
