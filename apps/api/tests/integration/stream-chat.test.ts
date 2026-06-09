import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OllamaClient } from '@/server/llm/ollama';
import { streamChat } from '@/server/chat/streamChat';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const U = '__w2_streamchat_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

function ndjsonResponse(lines: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(l + '\n'));
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe('streamChat', () => {
  it('saves user + npc messages and emits the W2 event sequence', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });

    const fetchImpl = vi.fn().mockResolvedValue(
      ndjsonResponse([
        JSON.stringify({ message: { content: 'hi ' }, done: false }),
        JSON.stringify({ message: { content: 'there' }, done: true }),
      ]),
    );
    const ollama = new OllamaClient({ fetchImpl });

    const events: SseEvent[] = [];
    for await (const e of streamChat({ prisma, ollama, userId: user.id, npcId: 'lily', text: '早上好 morning' })) {
      events.push(e);
    }

    const names = events.map((e) => e.event);
    expect(names[0]).toBe('user_message_saved');
    expect(names).toContain('typing_start');
    expect(names.filter((n) => n === 'token').length).toBe(2);
    expect(names).toContain('message_complete');
    expect(names[names.length - 1]).toBe('done');

    const complete = events.find((e) => e.event === 'message_complete')!.data as { fullText: string };
    expect(complete.fullText).toBe('hi there');

    const msgs = await prisma.message.findMany({ where: { thread: { userId: user.id, npcId: 'lily' } }, orderBy: { createdAt: 'asc' } });
    expect(msgs.map((m) => m.role)).toEqual(['user', 'npc']);
    expect(msgs[0].langDetect).toBe('mixed');
    expect(msgs[1].text).toBe('hi there');

    const rel = await prisma.relationship.findUnique({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel?.conversationCount).toBe(1);
    expect(rel?.relationshipPoints).toBe(1);
    const act = await prisma.activityEvent.count({ where: { userId: user.id, type: 'message_sent' } });
    expect(act).toBe(1);

    // W5: the achievement tick runs after a chat turn
    expect(await prisma.userAchievement.count({ where: { userId: user.id, achievementId: 'first_chat' } })).toBe(1);
  });

  it('emits an error event (not a throw) when the model is unreachable', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const ollama = new OllamaClient({ fetchImpl });

    const events: SseEvent[] = [];
    for await (const e of streamChat({ prisma, ollama, userId: user.id, npcId: 'lily', text: 'hello' })) {
      events.push(e);
    }
    const names = events.map((e) => e.event);
    expect(names).toContain('user_message_saved');
    expect(names).toContain('error');
    expect(names[names.length - 1]).toBe('done');
  });

  it('updates thread.lastMsgAt even when the LLM fails on the first turn', async () => {
    const U2 = U + '_err';
    await prisma.user.deleteMany({ where: { username: U2 } });
    const user = await prisma.user.create({ data: { username: U2, password: 'pw' } });
    const ollama = new OllamaClient({ fetchImpl: vi.fn().mockRejectedValue(new Error('down')) });

    const events: SseEvent[] = [];
    for await (const e of streamChat({ prisma, ollama, userId: user.id, npcId: 'lily', text: 'hi' })) {
      events.push(e);
    }

    const thread = await prisma.thread.findUnique({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(thread?.lastMsgAt).not.toBeNull();
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('levels up the relationship from a casual chat when points cross a threshold', async () => {
    const U3 = U + '_levelup';
    await prisma.user.deleteMany({ where: { username: U3 } });
    const user = await prisma.user.create({ data: { username: U3, password: 'pw' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'acquaintance', stageValue: 1, relationshipPoints: 29 } });

    const fetchImpl = vi.fn().mockResolvedValue(
      ndjsonResponse([JSON.stringify({ message: { content: 'hey!' }, done: true })]),
    );
    const ollama = new OllamaClient({ fetchImpl });
    for await (const _e of streamChat({ prisma, ollama, userId: user.id, npcId: 'lily', text: 'good morning' })) void _e;

    const rel = await prisma.relationship.findUniqueOrThrow({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel.relationshipPoints).toBe(30);
    expect(rel.stage).toBe('friend');
    expect(await prisma.relationshipEvent.count({ where: { relationshipId: rel.id, toStage: 'friend' } })).toBe(1);
    await prisma.user.delete({ where: { id: user.id } });
  });
});
