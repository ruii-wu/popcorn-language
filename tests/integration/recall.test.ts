// tests/integration/recall.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { recallForPrompt, listFacts } from '@/server/memory/recall';

const prisma = new PrismaClient();
const U = '__w3_recall_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('recallForPrompt', () => {
  it('honors the user memoryStrategy and splits facts vs summary', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({
      data: { username: U, password: 'pw', settings: { create: { memoryStrategy: 'recency' } } },
    });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'has_pet', value: 'a cat named Mochi' } });
    await prisma.conversationSummary.create({ data: { threadId: thread.id, fromMsgId: 'a', toMsgId: 'b', summary: 'discussed cats' } });

    const ollama = { embed: vi.fn() };
    const out = await recallForPrompt({ prisma, ollama, userId: user.id, npcId: 'lily', queryText: 'hello' });

    expect(out.facts).toContain('has pet: a cat named Mochi');
    expect(out.summary).toBe('discussed cats');
    expect(ollama.embed).not.toHaveBeenCalled(); // recency needs no embedding
  });

  it('never throws — returns empty on internal error', async () => {
    const ollama = { embed: vi.fn() };
    const out = await recallForPrompt({ prisma, ollama, userId: 'does-not-exist', queryText: 'x' });
    expect(out).toEqual({ facts: [], summary: undefined });
  });

  it('listFacts returns formatted fact strings newest-first', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'works_as', value: 'engineer' } });
    const facts = await listFacts(prisma, user.id, 8);
    expect(facts).toContain('works as: engineer');
    expect(facts).toContain('has pet: a cat named Mochi');
  });
});
