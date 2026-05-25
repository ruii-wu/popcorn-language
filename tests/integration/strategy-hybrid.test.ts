// tests/integration/strategy-hybrid.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { HybridStrategy } from '@/server/memory/strategies/hybrid';

const prisma = new PrismaClient();
const U = '__w3_hybrid_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('HybridStrategy', () => {
  it('blends semantic similarity with recency decay', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const now = Date.now();
    // Both equally similar to query [1,0]; "fresh" is newer so should rank first.
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'p', value: 'fresh', embedding: JSON.stringify([1, 0]), createdAt: new Date(now) } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'p', value: 'stale', embedding: JSON.stringify([1, 0]), createdAt: new Date(now - 30 * 24 * 3.6e6) } });

    const ollama = { embed: vi.fn().mockResolvedValue([1, 0]) };
    const strat = new HybridStrategy({ prisma, ollama }, () => now);
    const items = await strat.recall({ userId: user.id, queryText: 'q', k: 2 });

    expect(items[0].text).toBe('p: fresh');
    expect(items[1].text).toBe('p: stale');
    expect(items[0].score).toBeGreaterThan(items[1].score);
  });

  it('falls back to recency order when nothing is embedded (no embed call)', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    await prisma.memoryFact.deleteMany({ where: { userId: user.id } });
    const now = Date.now();
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'p', value: 'older', createdAt: new Date(now - 1000) } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'p', value: 'newer', createdAt: new Date(now) } });
    const ollama = { embed: vi.fn() };
    const strat = new HybridStrategy({ prisma, ollama }, () => now);
    const items = await strat.recall({ userId: user.id, queryText: 'q', k: 2 });
    expect(items.map((i) => i.text)).toEqual(['p: newer', 'p: older']);
    expect(ollama.embed).not.toHaveBeenCalled();
  });
});
