// tests/integration/stream-chat-scenario.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OllamaClient } from '@/server/llm/ollama';
import { streamChat } from '@/server/chat/streamChat';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const U = '__w4_streamoffer_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

function ndjson(lines: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) { for (const l of lines) c.enqueue(enc.encode(l + '\n')); c.close(); },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe('streamChat scenario offer', () => {
  it('emits scenario_offer when the user is a friend and mentions a scenario topic', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
    for (let i = 0; i < 4; i++) await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: `warmup ${i}` } });

    // streaming chat reply, then factExtract chatJson returns no facts
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      if (b.stream === true) return ndjson([JSON.stringify({ message: { content: 'sure!' }, done: true })]);
      return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ facts: [] }) } }) } as unknown as Response;
    });
    const ollama = new OllamaClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const events: SseEvent[] = [];
    for await (const e of streamChat({ prisma, ollama, userId: user.id, npcId: 'lily', text: 'can we do a mock interview?' })) {
      events.push(e);
    }

    const offer = events.find((e) => e.event === 'scenario_offer');
    expect(offer).toBeTruthy();
    expect((offer!.data as { draft: { title: string } }).draft.title).toBe('Mock Interview');
    expect(events.find((e) => e.event === 'message_complete')).toBeUndefined();
    expect(events.findIndex((e) => e.event === 'scenario_offer')).toBeLessThan(events.findIndex((e) => e.event === 'done'));
    expect(events[events.length - 1].event).toBe('done');
  });
});
