// tests/integration/summarize.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { maybeSummarizeThread } from '@/server/memory/summarize';

const prisma = new PrismaClient();
const U = '__w3_summarize_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

async function seedMessages(threadId: string, userId: string, n: number) {
  const base = Date.now();
  for (let i = 0; i < n; i++) {
    await prisma.message.create({
      data: { threadId, userId: i % 2 === 0 ? userId : null, role: i % 2 === 0 ? 'user' : 'npc', text: `m${i}`, createdAt: new Date(base + i * 1000) },
    });
  }
}

describe('maybeSummarizeThread', () => {
  it('no-ops below the threshold', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await seedMessages(thread.id, user.id, 8); // < SUMMARY_EVERY (10)
    const ollama = { chatJson: vi.fn(), embed: vi.fn() };
    const result = await maybeSummarizeThread({ prisma, ollama, userId: user.id, threadId: thread.id });
    expect(result).toBeNull();
    expect(ollama.chatJson).not.toHaveBeenCalled();
    expect(await prisma.conversationSummary.count({ where: { threadId: thread.id } })).toBe(0);
  });

  it('summarizes the first window once the thread is long enough, then is idempotent', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const thread = await prisma.thread.findFirstOrThrow({ where: { userId: user.id, npcId: 'lily' } });
    await prisma.message.deleteMany({ where: { threadId: thread.id } });
    await seedMessages(thread.id, user.id, 14); // due = floor((14-4)/10) = 1

    const ollama = {
      chatJson: vi.fn().mockResolvedValue({ summary: 'they talked about m0..m9' }),
      embed: vi.fn().mockResolvedValue([0.5, 0.5]),
    };
    const first = await maybeSummarizeThread({ prisma, ollama, userId: user.id, threadId: thread.id });
    expect(first).toBe('they talked about m0..m9');
    const rows = await prisma.conversationSummary.findMany({ where: { threadId: thread.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].embedding).toBe(JSON.stringify([0.5, 0.5]));

    // second call: existing(1) >= due(1) → no-op
    const second = await maybeSummarizeThread({ prisma, ollama, userId: user.id, threadId: thread.id });
    expect(second).toBeNull();
    expect(await prisma.conversationSummary.count({ where: { threadId: thread.id } })).toBe(1);
  });

  it('returns null for a thread the caller does not own, even when a window is due', async () => {
    const owner = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const thread = await prisma.thread.findFirstOrThrow({ where: { userId: owner.id, npcId: 'lily' } });
    await prisma.conversationSummary.deleteMany({ where: { threadId: thread.id } }); // a window would be due again
    const ollama = { chatJson: vi.fn(), embed: vi.fn() };
    const result = await maybeSummarizeThread({ prisma, ollama, userId: 'someone-else', threadId: thread.id });
    expect(result).toBeNull();
    expect(ollama.chatJson).not.toHaveBeenCalled();
  });
});
