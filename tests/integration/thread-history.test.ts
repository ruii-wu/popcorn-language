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

  it('DELETE clears the thread messages', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    expect((await (await clearThread(del(user.id), { params: { npcId: 'lily' } })).json()).ok).toBe(true);
    const remaining = await prisma.message.count({ where: { thread: { userId: user.id, npcId: 'lily' } } });
    expect(remaining).toBe(0);
  });
});
