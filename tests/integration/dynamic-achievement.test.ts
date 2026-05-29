// tests/integration/dynamic-achievement.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { generateDynamicAchievement } from '@/server/achievements/dynamic';

const prisma = new PrismaClient();
const U = '__w8_dyn_ach__';

afterAll(async () => {
  // remove dynamic defs created for this user's achievements, then the user
  const u = await prisma.user.findFirst({ where: { username: U } });
  if (u) {
    const mine = await prisma.userAchievement.findMany({ where: { userId: u.id } });
    await prisma.user.deleteMany({ where: { username: U } });
    await prisma.achievementDef.deleteMany({ where: { id: { in: mine.map((m) => m.achievementId) }, isDynamic: true } });
  }
  await prisma.$disconnect();
});

describe('generateDynamicAchievement', () => {
  it('mints an owned dynamic achievement (def isDynamic + UserAchievement) and returns it', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.activityEvent.create({ data: { userId: user.id, type: 'message_sent' } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'has_pet', value: 'cat' } });

    const ollama = {
      chatJson: vi.fn().mockResolvedValue({ title: 'Cat Whisperer', description: 'You bonded over your cat.', icon: '🐱' }),
    };
    const ach = await generateDynamicAchievement(prisma, ollama, user.id);

    expect(ach).not.toBeNull();
    expect(ach!.title).toBe('Cat Whisperer');
    expect(ach!.id.startsWith('dyn_')).toBe(true);

    const def = await prisma.achievementDef.findUniqueOrThrow({ where: { id: ach!.id } });
    expect(def.isDynamic).toBe(true);
    expect(def.enabled).toBe(true);
    expect(def.rule).toBe('dynamic');
    expect(JSON.parse(def.ruleConfig!).ownerUserId).toBe(user.id);
    expect(await prisma.userAchievement.count({ where: { userId: user.id, achievementId: ach!.id } })).toBe(1);
  });

  it('returns null (and creates nothing) when the LLM fails', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const before = await prisma.userAchievement.count({ where: { userId: user.id } });
    const ollama = { chatJson: vi.fn().mockRejectedValue(new Error('LLM down')) };
    expect(await generateDynamicAchievement(prisma, ollama, user.id)).toBeNull();
    expect(await prisma.userAchievement.count({ where: { userId: user.id } })).toBe(before);
  });

  it('returns null when the generated title duplicates one the user already has', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const before = await prisma.userAchievement.count({ where: { userId: user.id } });
    // 'First Chat' is a seeded static title; case-insensitive duplicate must be skipped.
    const ollama = { chatJson: vi.fn().mockResolvedValue({ title: 'first chat', description: 'dup', icon: '⭐' }) };
    expect(await generateDynamicAchievement(prisma, ollama, user.id)).toBeNull();
    expect(await prisma.userAchievement.count({ where: { userId: user.id } })).toBe(before);
  });
});
