// tests/integration/strategy-semantic.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SemanticStrategy } from '@/server/memory/strategies/semantic';

const prisma = new PrismaClient();
const U = '__w3_semantic_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('SemanticStrategy', () => {
  it('ranks candidates by cosine similarity to the query embedding, top-k', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    // query embed = [1,0]; "cat" aligned with it, "weather" orthogonal
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'has_pet', value: 'cat', embedding: JSON.stringify([1, 0]) } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'topic', value: 'weather', embedding: JSON.stringify([0, 1]) } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'no_embed', value: 'ignored' } }); // null embedding skipped

    const ollama = { embed: vi.fn().mockResolvedValue([1, 0]) };
    const strat = new SemanticStrategy({ prisma, ollama });
    const items = await strat.recall({ userId: user.id, queryText: 'tell me about your pet', k: 1 });

    expect(ollama.embed).toHaveBeenCalledWith('tell me about your pet');
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('has pet: cat');
    expect(items[0].score).toBeGreaterThan(0.9);
  });

  it('returns [] without calling embed when no candidate has an embedding', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    await prisma.memoryFact.deleteMany({ where: { userId: user.id } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'no_embed', value: 'x' } });
    const ollama = { embed: vi.fn() };
    const strat = new SemanticStrategy({ prisma, ollama });
    const items = await strat.recall({ userId: user.id, queryText: 'q', k: 5 });
    expect(items).toEqual([]);
    expect(ollama.embed).not.toHaveBeenCalled();
  });
});
