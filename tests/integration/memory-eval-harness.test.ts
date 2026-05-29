// tests/integration/memory-eval-harness.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runMemoryEval } from '@/server/memory/eval/harness';
import { fixtureOllama } from '@/server/memory/eval/fixtureEmbed';

const prisma = new PrismaClient();
const CALLER = '__w7_harness_caller__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { in: [CALLER] } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: '__memeval__' } } });
  await prisma.$disconnect();
});

describe('runMemoryEval', () => {
  it('compares all four strategies, logs per probe for the caller, and cleans up the eval user', async () => {
    const caller = await prisma.user.create({ data: { username: CALLER, password: 'pw' } });

    const result = await runMemoryEval(prisma, fixtureOllama, caller.id, { k: 3 });

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
    // The proposed hybrid method also beats the recency baseline on the fixture.
    expect(get('hybrid').recallAtK).toBeGreaterThanOrEqual(get('recency').recallAtK);

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
