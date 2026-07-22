import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET as history } from '@/app/api/threads/[npcId]/messages/route';
import { DELETE as clearThread } from '@/app/api/threads/[npcId]/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w2_history_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const get = (uid: string, qs = '') => new Request('http://x/' + qs, { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });
const del = (uid: string) => new Request('http://x/', { method: 'DELETE', headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('thread history', () => {
  it('returns empty for a thread that does not exist yet', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const data = await (await history(get(user.id), { params: { npcId: 'lily' } })).json();
    expect(data).toEqual({ messages: [], hasMore: false });
  });

  it('paginates oldest-first with hasMore + before cursor', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    for (let i = 0; i < 5; i++) {
      await prisma.message.create({
        data: { threadId: thread.id, userId: i % 2 === 0 ? user.id : null, role: i % 2 === 0 ? 'user' : 'npc', text: `m${i}`, createdAt: new Date(Date.now() + i * 1000) },
      });
    }
    const page1 = await (await history(get(user.id, '?limit=3'), { params: { npcId: 'lily' } })).json();
    expect(page1.messages.map((m: { text: string }) => m.text)).toEqual(['m2', 'm3', 'm4']);
    expect(page1.hasMore).toBe(true);
    expect(page1.messages[0].from).toBe('user');

    const cursor = page1.messages[0].id;
    const page2 = await (await history(get(user.id, `?limit=3&before=${cursor}`), { params: { npcId: 'lily' } })).json();
    expect(page2.messages.map((m: { text: string }) => m.text)).toEqual(['m0', 'm1']);
    expect(page2.hasMore).toBe(false);
  });

  it('ignores a before cursor that belongs to a different thread', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const otherThread = await prisma.thread.create({ data: { userId: user.id, npcId: 'emma' } });
    const foreign = await prisma.message.create({
      data: { threadId: otherThread.id, userId: null, role: 'npc', text: 'foreign', createdAt: new Date(Date.now() - 100000) },
    });
    const data = await (await history(get(user.id, `?before=${foreign.id}`), { params: { npcId: 'lily' } })).json();
    // foreign cursor is scoped out, so all 5 lily messages return (the bug would steer to an empty page)
    expect(data.messages.map((m: { text: string }) => m.text)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
  });

  it('collapses a completed Scenario transcript into one review card', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const thread = await prisma.thread.findUniqueOrThrow({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    const endedAt = new Date(Date.now() + 10_000);
    const session = await prisma.scenarioSession.create({
      data: {
        userId: user.id,
        npcId: 'lily',
        threadId: thread.id,
        templateId: 'mock_interview',
        status: 'completed',
        startedAt: new Date(endedAt.getTime() - 5_000),
        endedAt,
      },
    });
    await prisma.message.createMany({
      data: [
        { threadId: thread.id, userId: user.id, role: 'user', text: 'scenario answer', scenarioSessionId: session.id },
        { threadId: thread.id, userId: null, role: 'npc', text: 'scenario reply', scenarioSessionId: session.id },
      ],
    });
    await prisma.scenarioSummary.create({
      data: {
        sessionId: session.id,
        grade: 'A',
        languageNote: 'Clear.',
        pragmaticsNote: 'Polite.',
        relationshipNote: 'Warm.',
      },
    });

    const data = await (await history(get(user.id, '?limit=20'), { params: { npcId: 'lily' } })).json();
    expect(data.messages.some((m: { text: string }) => m.text === 'scenario answer')).toBe(false);
    expect(data.messages.some((m: { text: string }) => m.text === 'scenario reply')).toBe(false);
    const cards = data.messages.filter((m: { kind: string }) => m.kind === 'scenario');
    expect(cards).toEqual([expect.objectContaining({
      id: `scenario:${session.id}`,
      scenarioSessionId: session.id,
      scenarioTitle: 'Mock Interview',
      scenarioGrade: 'A',
      from: 'npc',
    })]);

    const beforeCard = await (await history(get(user.id, `?limit=20&before=${encodeURIComponent(cards[0].id)}`), { params: { npcId: 'lily' } })).json();
    expect(beforeCard.messages.some((m: { kind: string }) => m.kind === 'scenario')).toBe(false);
    expect(beforeCard.messages.map((m: { text: string }) => m.text)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
  });

  it('DELETE clears the thread messages', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    expect((await (await clearThread(del(user.id), { params: { npcId: 'lily' } })).json()).ok).toBe(true);
    const remaining = await prisma.message.count({ where: { thread: { userId: user.id, npcId: 'lily' } } });
    expect(remaining).toBe(0);
  });
});
