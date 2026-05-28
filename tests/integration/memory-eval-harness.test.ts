// tests/integration/memory-eval-harness.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runMemoryEval } from '@/server/memory/eval/harness';

const prisma = new PrismaClient();
const CALLER = '__w7_harness_caller__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { in: [CALLER] } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: '__memeval__' } } });
  await prisma.$disconnect();
});

// Deterministic topic-classifier embedding: each text maps to one orthogonal basis vector,
// so cosine cleanly ranks the topically-matching corpus item first. Priority order matters
// (the summary text mentions both "hiking" and "cat" — hiking wins).
const E = {
  hobby: [1, 0, 0, 0, 0],
  pet: [0, 1, 0, 0, 0],
  job: [0, 0, 1, 0, 0],
  food: [0, 0, 0, 1, 0],
  other: [0, 0, 0, 0, 1],
};
const TOPICS: { vec: number[]; words: string[] }[] = [
  { vec: E.hobby, words: ['hiking', 'outdoor', 'weekend'] },
  { vec: E.pet, words: ['pet', 'cat'] },
  { vec: E.job, words: ['work', 'job', 'engineer'] },
  { vec: E.food, words: ['spicy', 'food', 'dish'] },
];
const ollamaMock = {
  embed: async (text: string): Promise<number[]> => {
    const t = text.toLowerCase();
    for (const top of TOPICS) if (top.words.some((w) => t.includes(w))) return top.vec;
    return E.other;
  },
};

describe('runMemoryEval', () => {
  it('compares all four strategies, logs per probe for the caller, and cleans up the eval user', async () => {
    const caller = await prisma.user.create({ data: { username: CALLER, password: 'pw' } });

    const result = await runMemoryEval(prisma, ollamaMock, caller.id, { k: 3 });

    expect(result.datasetId).toBe('default');
    expect(result.k).toBe(3);
    expect(result.perStrategy.map((s) => s.name).sort()).toEqual(
      ['hybrid', 'recency', 'semantic', 'summary'],
    );

    for (const s of result.perStrategy) {
      expect(s.recallAtK).toBeGreaterThanOrEqual(0);
      expect(s.recallAtK).toBeLessThanOrEqual(1);
      expect(s.latencyMs).toBeGreaterThanOrEqual(0);
      expect(s.tokenCost).toBeGreaterThanOrEqual(0);
    }

    const get = (n: string) => result.perStrategy.find((s) => s.name === n)!;
    // The research hypothesis holds on the fixture: semantic recovers the older topical facts
    // that the recency baseline misses.
    expect(get('semantic').recallAtK).toBeGreaterThan(get('recency').recallAtK);
    expect(get('semantic').recallAtK).toBe(1);

    // One MemoryRetrievalLog row per (strategy × probe), attributed to the caller.
    const logCount = await prisma.memoryRetrievalLog.count({ where: { userId: caller.id } });
    expect(logCount).toBe(4 * 4); // 4 strategies × 4 probes
    const oneLog = await prisma.memoryRetrievalLog.findFirst({ where: { userId: caller.id } });
    expect(oneLog?.k).toBe(3);

    // The throwaway eval user is gone; no orphan memeval users remain.
    expect(await prisma.user.count({ where: { username: { startsWith: '__memeval__' } } })).toBe(0);
    // The caller owns no facts/threads (its data was never touched — only logs were written).
    expect(await prisma.memoryFact.count({ where: { userId: caller.id } })).toBe(0);
    expect(await prisma.thread.count({ where: { userId: caller.id } })).toBe(0);
  });
});
