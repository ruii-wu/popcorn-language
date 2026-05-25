// tests/integration/strategy-summary.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SummaryStrategy } from '@/server/memory/strategies/summary';

const prisma = new PrismaClient();
const U = '__w3_summary_user__';
const noEmbed = { embed: async () => [] as number[] };

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('SummaryStrategy', () => {
  it('returns the latest summary first, then all facts (unranked)', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'has_pet', value: 'a cat' } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'works_as', value: 'engineer' } });
    await prisma.conversationSummary.create({
      data: { threadId: thread.id, fromMsgId: 'a', toMsgId: 'b', summary: 'old', createdAt: new Date(Date.now() - 5000) },
    });
    await prisma.conversationSummary.create({
      data: { threadId: thread.id, fromMsgId: 'c', toMsgId: 'd', summary: 'newest', createdAt: new Date() },
    });

    const strat = new SummaryStrategy({ prisma, ollama: noEmbed });
    const items = await strat.recall({ userId: user.id, npcId: 'lily', queryText: 'x', k: 6 });

    expect(items[0].kind).toBe('summary');
    expect(items[0].text).toBe('newest');
    const facts = items.filter((i) => i.kind === 'fact').map((i) => i.text);
    expect(facts).toContain('has pet: a cat');
    expect(facts).toContain('works as: engineer');
    // only one (the latest) summary is included
    expect(items.filter((i) => i.kind === 'summary')).toHaveLength(1);
  });
});
