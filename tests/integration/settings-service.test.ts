// tests/integration/settings-service.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { readSettings, writeSettings, DEFAULT_SETTINGS } from '@/server/settings/settings';

const prisma = new PrismaClient();
const U = '__w6_settings_svc__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('settings service', () => {
  it('readSettings returns defaults when no row exists', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    expect(await readSettings(prisma, user.id)).toEqual(DEFAULT_SETTINGS);
  });

  it('writeSettings creates a row from a partial patch and merges over defaults', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const after = await writeSettings(prisma, user.id, { grammarCorrection: false, memoryStrategy: 'semantic' });
    expect(after.grammarCorrection).toBe(false);
    expect(after.memoryStrategy).toBe('semantic');
    expect(after.modelName).toBe(DEFAULT_SETTINGS.modelName);
    expect((await readSettings(prisma, user.id)).memoryStrategy).toBe('semantic');
  });

  it('writeSettings updates an existing row, leaving unspecified fields intact', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const after = await writeSettings(prisma, user.id, { modelName: 'llama3.1:8b' });
    expect(after.modelName).toBe('llama3.1:8b');
    expect(after.grammarCorrection).toBe(false);
    expect(after.memoryStrategy).toBe('semantic');
  });
});
