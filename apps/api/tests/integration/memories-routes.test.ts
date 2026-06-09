// tests/integration/memories-routes.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET as listMemories } from '@/app/api/memories/route';
import { GET as recentMemories } from '@/app/api/memories/recent/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w3_memories_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const get = (uid: string, qs = '') => new Request('http://x/' + qs, { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('memories endpoints', () => {
  it('lists user memories, filters by npcId, and recent returns trimmed cards', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.memory.create({ data: { userId: user.id, title: 'Cat Person', body: 'Loves cats', npcId: 'lily', sourceType: 'chat_pattern' } });
    await prisma.memory.create({ data: { userId: user.id, title: 'Cross', body: 'general', npcId: null, sourceType: 'chat_pattern' } });
    await prisma.memory.create({ data: { userId: user.id, title: 'Hidden', body: 'gone', sourceType: 'chat_pattern', dismissedAt: new Date() } });

    const all = await (await listMemories(get(user.id))).json();
    expect(all.map((m: { title: string }) => m.title)).toContain('Cat Person');
    expect(all.map((m: { title: string }) => m.title)).not.toContain('Hidden'); // dismissed excluded

    const lily = await (await listMemories(get(user.id, '?npcId=lily'))).json();
    expect(lily.every((m: { npcId: string | null }) => m.npcId === 'lily')).toBe(true);

    const recent = await (await recentMemories(get(user.id, '?npcId=lily'))).json();
    // recent includes the npc's cards + cross-NPC observations, shape {id,title,body}
    expect(recent[0]).toHaveProperty('title');
    expect(recent.map((m: { title: string }) => m.title)).toEqual(expect.arrayContaining(['Cat Person', 'Cross']));
  });

  it('401s without a cookie', async () => {
    expect((await listMemories(new Request('http://x/'))).status).toBe(401);
  });
});
