// tests/integration/stream-chat-memory.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OllamaClient } from '@/server/llm/ollama';
import { streamChat } from '@/server/chat/streamChat';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const U = '__w3_streammem_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

function ndjson(lines: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(l + '\n'));
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe('streamChat memory integration', () => {
  it('recalls a known fact into the system prompt for the turn', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({
      data: { username: U, password: 'pw', settings: { create: { memoryStrategy: 'recency' } } },
    });
    // a fact the NPC should remember
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'has_pet', value: 'a cat named Mochi' } });

    let chatMessages: { role: string; content: string }[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      if (b.stream === true) {
        chatMessages = b.messages; // the streaming chat call carries the system prompt
        return ndjson([JSON.stringify({ message: { content: 'meow' }, done: true })]);
      }
      // factExtract chatJson (stream:false, format:json) → return no new facts
      return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ facts: [] }) } }) } as unknown as Response;
    });
    const ollama = new OllamaClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const events: SseEvent[] = [];
    for await (const e of streamChat({ prisma, ollama, userId: user.id, npcId: 'lily', text: 'what do you remember?' })) {
      events.push(e);
    }

    const system = chatMessages.find((m) => m.role === 'system');
    expect(system?.content).toContain('a cat named Mochi');
    expect(events[events.length - 1].event).toBe('done');
    expect(events.find((e) => e.event === 'message_complete')).toBeTruthy();
  });
});
