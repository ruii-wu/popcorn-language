// tests/integration/strategy-recency.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { RecencyStrategy } from '@/server/memory/strategies/recency';

const prisma = new PrismaClient();
const U = '__w3_recency_user__';
const noEmbed = { embed: async () => [] as number[] };

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('RecencyStrategy', () => {
  it('returns the most recent facts + summaries newest-first, capped at k', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    const base = Date.now();
    for (let i = 0; i < 4; i++) {
      await prisma.memoryFact.create({
        data: { userId: user.id, predicate: 'likes', value: `thing${i}`, createdAt: new Date(base + i * 1000) },
      });
    }
    await prisma.conversationSummary.create({
      data: { threadId: thread.id, fromMsgId: 'a', toMsgId: 'b', summary: 'recent summary', createdAt: new Date(base + 10000) },
    });

    const strat = new RecencyStrategy({ prisma, ollama: noEmbed });
    const items = await strat.recall({ userId: user.id, npcId: 'lily', queryText: 'x', k: 3 });

    expect(items).toHaveLength(3);
    expect(items[0].kind).toBe('summary');
    expect(items[0].text).toBe('recent summary');
    expect(items[1].text).toBe('likes: thing3');
    expect(items[2].text).toBe('likes: thing2');
  });
});
