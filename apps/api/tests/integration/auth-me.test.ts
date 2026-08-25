import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me } from '@/app/api/auth/me/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w2_me_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const withUid = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('auth me + logout', () => {
  it('logout clears the cookie', async () => {
    const res = await logout();
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('me 401s without a cookie', async () => {
    expect((await me(new Request('http://x/'))).status).toBe(401);
  });

  it('me returns user, streak and totals', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'Hello' } });
    await prisma.activityEvent.create({ data: { userId: user.id, type: 'message_sent' } });

    const res = await me(withUid(user.id));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.username).toBe(U);
    expect(data.streak.weekCount).toBe(1);
    expect(data.totals).toEqual({ conversations: 1, scenarios: 0, memories: 0 });
  });
});
