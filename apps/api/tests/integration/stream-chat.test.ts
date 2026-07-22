import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OllamaClient } from '@/server/llm/ollama';
import { streamChat, streamDeferredChat } from '@/server/chat/streamChat';
import { DELETE as retractMessage } from '@/app/api/threads/[npcId]/messages/[msgId]/route';
import { SESSION_COOKIE } from '@/server/auth/session';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const U = '__w2_streamchat_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: U } } });
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

function retractReq(userId: string) {
  return new Request('http://x/', {
    method: 'DELETE',
    headers: { cookie: `${SESSION_COOKIE}=${userId}` },
  });
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
    expect(names.indexOf('typing_start')).toBeLessThan(names.indexOf('typing_end'));
    expect(names.indexOf('typing_end')).toBeLessThan(names.indexOf('token'));
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

  it.each([
    { name: 'the streaming user turn', retractEarlier: false },
    { name: 'an earlier turn that cascade-hides the streaming user turn', retractEarlier: true },
  ])('does not persist an NPC reply after retracting $name', async ({ retractEarlier }) => {
    const suffix = retractEarlier ? '_cascade' : '_same';
    const username = U + suffix;
    await prisma.user.deleteMany({ where: { username } });
    const user = await prisma.user.create({ data: { username, password: 'pw' } });
    await prisma.userSettings.create({
      data: { userId: user.id, memoryStrategy: 'recency', grammarCorrection: false },
    });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily' } });
    const base = Date.parse('2026-07-22T02:00:00.000Z');
    const earlier = await prisma.message.create({
      data: { threadId: thread.id, userId: user.id, role: 'user', text: 'earlier', createdAt: new Date(base) },
    });
    const current = await prisma.message.create({
      data: { threadId: thread.id, userId: user.id, role: 'user', text: 'current', createdAt: new Date(base + 1_000) },
    });
    await prisma.thread.update({ where: { id: thread.id }, data: { lastMsgAt: current.createdAt } });

    let releaseModel!: () => void;
    const modelGate = new Promise<void>((resolve) => { releaseModel = resolve; });
    const ollama = {
      async *chat() {
        yield 'partial';
        await modelGate;
        yield ' reply';
      },
      embed: vi.fn().mockResolvedValue([]),
      chatJson: vi.fn(),
    } as unknown as OllamaClient;

    const events: SseEvent[] = [];
    let recalled = false;
    for await (const event of streamDeferredChat({
      prisma,
      ollama,
      userId: user.id,
      npcId: 'lily',
      threadId: thread.id,
      userMsgId: current.id,
      text: current.text,
    })) {
      events.push(event);
      if (event.event === 'token' && !recalled) {
        recalled = true;
        const target = retractEarlier ? earlier : current;
        const response = await retractMessage(retractReq(user.id), {
          params: { npcId: 'lily', msgId: target.id },
        });
        expect(response.status).toBe(200);
        releaseModel();
      }
    }

    expect(events.some((event) => event.event === 'message_complete')).toBe(false);
    expect(await prisma.message.count({ where: { threadId: thread.id, role: 'npc' } })).toBe(0);
    const storedCurrent = await prisma.message.findUniqueOrThrow({ where: { id: current.id } });
    if (retractEarlier) expect(storedCurrent.hiddenAt).not.toBeNull();
    else expect(storedCurrent.retractedAt).not.toBeNull();
    expect((await prisma.thread.findUniqueOrThrow({ where: { id: thread.id } })).lastMsgAt?.getTime())
      .toBe((retractEarlier ? earlier.createdAt : current.createdAt).getTime());
  });
});
