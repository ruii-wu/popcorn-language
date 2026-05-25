// tests/integration/post-turn-memory.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runPostTurnMemory } from '@/server/memory/postTurn';

const prisma = new PrismaClient();
const U = '__w3_postturn_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('runPostTurnMemory', () => {
  it('extracts facts and is fully guarded against LLM failure', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });

    const ollama = {
      chatJson: vi.fn().mockResolvedValue({ facts: [{ subject: 'user', predicate: 'has_pet', value: 'a dog', confidence: 0.9 }] }),
      embed: vi.fn().mockResolvedValue([1, 2]),
    };
    await runPostTurnMemory({ prisma, ollama, userId: user.id, threadId: thread.id, userText: 'I have a dog', userMsgId: 'm1' });
    expect(await prisma.memoryFact.count({ where: { userId: user.id, predicate: 'has_pet' } })).toBe(1);

    // failure path: chatJson throws → no throw out of runPostTurnMemory
    const failing = { chatJson: vi.fn().mockRejectedValue(new Error('llm down')), embed: vi.fn() };
    await expect(
      runPostTurnMemory({ prisma, ollama: failing, userId: user.id, threadId: thread.id, userText: 'x', userMsgId: 'm2' }),
    ).resolves.toBeUndefined();
  });
});
