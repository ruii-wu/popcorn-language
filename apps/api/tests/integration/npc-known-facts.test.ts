// tests/integration/npc-known-facts.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET as detail } from '@/app/api/npcs/[id]/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w3_knownfacts_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const req = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('npc detail knownFacts', () => {
  it('returns only the facts this NPC knows', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'has_pet', value: 'a cat named Mochi', knownToNpcs: JSON.stringify(['lily']) } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'works_as', value: 'engineer', knownToNpcs: JSON.stringify(['chen']) } });

    const d = await (await detail(req(user.id), { params: { id: 'lily' } })).json();
    expect(d.knownFacts).toContain('has pet: a cat named Mochi');
    expect(d.knownFacts).not.toContain('works as: engineer'); // chen-only fact absent for lily
  });

  it('derives chat statistics from visible messages instead of the relationship cache', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({
      data: { userId: user.id, npcId: 'lily', conversationCount: 99 },
    });
    await prisma.message.create({
      data: { threadId: thread.id, userId: user.id, role: 'user', text: 'visible turn' },
    });
    await prisma.message.create({
      data: { threadId: thread.id, userId: null, role: 'npc', text: 'visible reply' },
    });
    await prisma.message.create({
      data: { threadId: thread.id, userId: user.id, role: 'user', text: 'retracted', retractedAt: new Date() },
    });

    const d = await (await detail(req(user.id), { params: { id: 'lily' } })).json();
    expect(d.chatStats).toEqual({ visibleMessages: 2, practiceTurns: 1 });
  });
});
