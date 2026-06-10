// tests/integration/fact-extract.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { extractAndStoreFacts } from '@/server/memory/factExtract';

const prisma = new PrismaClient();
const U = '__w3_factextract_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('extractAndStoreFacts', () => {
  it('persists extracted facts with embeddings and skips duplicates', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });

    const ollama = {
      chatJson: vi.fn().mockResolvedValue({
        facts: [
          { subject: 'user', predicate: 'has_pet', value: 'a cat named Mochi', confidence: 0.9 },
          { subject: 'user', predicate: 'works_as', value: 'software engineer', confidence: 0.8 },
        ],
      }),
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };

    const n1 = await extractAndStoreFacts({ prisma, ollama, userId: user.id, text: "I have a cat named Mochi and I'm a software engineer", sourceMsgId: 'msg1' });
    expect(n1).toBe(2);

    const stored = await prisma.memoryFact.findMany({ where: { userId: user.id }, orderBy: { predicate: 'asc' } });
    expect(stored.map((f) => f.predicate)).toEqual(['has_pet', 'works_as']);
    expect(stored[0].embedding).toBe(JSON.stringify([0.1, 0.2, 0.3]));
    expect(stored[0].sourceMsgId).toBe('msg1');
    expect(ollama.embed).toHaveBeenCalledTimes(2);

    // second run with the same facts → no duplicates
    const n2 = await extractAndStoreFacts({ prisma, ollama, userId: user.id, text: 'same again' });
    expect(n2).toBe(0);
    expect(await prisma.memoryFact.count({ where: { userId: user.id } })).toBe(2);
  });

  it('stores facts with null embedding when embed fails (does not throw)', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const ollama = {
      chatJson: vi.fn().mockResolvedValue({ facts: [{ subject: 'user', predicate: 'lives_near', value: 'Brooklyn', confidence: 0.7 }] }),
      embed: vi.fn().mockRejectedValue(new Error('embed down')),
    };
    const n = await extractAndStoreFacts({ prisma, ollama, userId: user.id, text: 'I live in Brooklyn' });
    expect(n).toBe(1);
    const f = await prisma.memoryFact.findFirstOrThrow({ where: { userId: user.id, predicate: 'lives_near' } });
    expect(f.embedding).toBeNull();
  });

  it('scopes new facts to the chatting NPC and merges on re-learn', async () => {
    const U2 = '__w3_factscope_user__';
    await prisma.user.deleteMany({ where: { username: U2 } });
    const user = await prisma.user.create({ data: { username: U2, password: 'pw' } });
    const ollama = {
      chatJson: vi.fn().mockResolvedValue({ facts: [{ subject: 'user', predicate: 'likes', value: 'coffee', confidence: 0.9 }] }),
      embed: vi.fn().mockResolvedValue([0.1]),
    };

    await extractAndStoreFacts({ prisma, ollama, userId: user.id, text: 'I like coffee', npcId: 'lily' });
    let f = await prisma.memoryFact.findFirstOrThrow({ where: { userId: user.id, predicate: 'likes' } });
    expect(JSON.parse(f.knownToNpcs)).toEqual(['lily']);

    // same fact re-learned in a chat with chen → merge, no duplicate row
    const n = await extractAndStoreFacts({ prisma, ollama, userId: user.id, text: 'I like coffee', npcId: 'chen' });
    expect(n).toBe(0);
    f = await prisma.memoryFact.findFirstOrThrow({ where: { userId: user.id, predicate: 'likes' } });
    expect(JSON.parse(f.knownToNpcs).sort()).toEqual(['chen', 'lily']);
    expect(await prisma.memoryFact.count({ where: { userId: user.id, predicate: 'likes' } })).toBe(1);

    await prisma.user.deleteMany({ where: { username: U2 } });
  });
});
