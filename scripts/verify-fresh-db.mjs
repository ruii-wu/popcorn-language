import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'popcorn-verify-'));
const databasePath = path.join(tempDir, 'verify.db');
const databaseUrl = `file:${databasePath}`;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  DEMO_SEED_NOW: '2026-08-30T12:00:00.000Z',
};

function run(args) {
  const result = spawnSync(npm, args, { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Command failed: npm ${args.join(' ')}`);
  }
}

try {
  console.log(`Verifying migrations and seeds on temporary SQLite database: ${databasePath}`);
  run(['run', 'predb:migrate', '-w', 'apps/api']);
  run(['exec', '-w', 'apps/api', '--', 'prisma', 'migrate', 'deploy']);
  run(['run', 'db:seed', '-w', 'apps/api']);
  run(['run', 'db:seed:demo', '-w', 'apps/api']);

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const [demoUsers, npcs, templates, skills] = await Promise.all([
      prisma.user.count({ where: { username: 'demo' } }),
      prisma.npc.count(),
      prisma.scenarioTemplate.count(),
      prisma.learningSkill.count(),
    ]);
    if (demoUsers !== 1 || npcs < 3 || templates < 2 || skills < 30) {
      throw new Error(
        `Unexpected seed counts: demo=${demoUsers}, npcs=${npcs}, templates=${templates}, skills=${skills}`,
      );
    }
    console.log(`Fresh database OK: demo=${demoUsers}, npcs=${npcs}, templates=${templates}, skills=${skills}`);
  } finally {
    await prisma.$disconnect();
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
