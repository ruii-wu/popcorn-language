// tests/integration/stream-chat-correction.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OllamaClient } from '@/server/llm/ollama';
import { streamChat } from '@/server/chat/streamChat';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const U = '__w5_correction_stream_user__';

afterAll(async () => { await prisma.user.deleteMany({ where: { username: U } }); await prisma.$disconnect(); });

function ndjson(lines: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const l of lines) c.enqueue(enc.encode(l + '\n')); c.close(); } });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe('streamChat grammar correction', () => {
  it('emits a correction event and persists it onto the user message', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });

    let jsonCalls = 0;
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      if (b.stream === true) return ndjson([JSON.stringify({ message: { content: 'no worries!' }, done: true })]);
      jsonCalls++;
      const content = jsonCalls === 1
        ? JSON.stringify({ hasIssue: true, fixed: 'I went there yesterday.', noteZh: '用过去式 went。', tag: 'tense' })
        : JSON.stringify({ facts: [] });
      return { ok: true, status: 200, json: async () => ({ message: { content } }) } as unknown as Response;
    });
    const ollama = new OllamaClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const events: SseEvent[] = [];
    for await (const e of streamChat({ prisma, ollama, userId: user.id, npcId: 'lily', text: 'I go there yesterday.' })) events.push(e);

    const corr = events.find((e) => e.event === 'correction');
    expect(corr).toBeTruthy();
    const data = corr!.data as { targetMessageId: string; correction: { fixed: string; tag: string } };
    expect(data.correction.fixed).toBe('I went there yesterday.');
    expect(data.correction.tag).toBe('tense');

    const userMsg = await prisma.message.findUniqueOrThrow({ where: { id: data.targetMessageId } });
    expect(userMsg.role).toBe('user');
    expect(JSON.parse(userMsg.correction!).fixed).toBe('I went there yesterday.');
  });

  it('skips correction when the user disabled it in settings', async () => {
    const U2 = U + '_off';
    await prisma.user.deleteMany({ where: { username: U2 } });
    const user = await prisma.user.create({ data: { username: U2, password: 'pw' } });
    await prisma.userSettings.create({ data: { userId: user.id, grammarCorrection: false } });

    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      if (b.stream === true) return ndjson([JSON.stringify({ message: { content: 'ok' }, done: true })]);
      return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ facts: [] }) } }) } as unknown as Response;
    });
    const ollama = new OllamaClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const events: SseEvent[] = [];
    for await (const e of streamChat({ prisma, ollama, userId: user.id, npcId: 'lily', text: 'I go there yesterday.' })) events.push(e);
    expect(events.find((e) => e.event === 'correction')).toBeUndefined();
    await prisma.user.delete({ where: { id: user.id } });
  });
});
