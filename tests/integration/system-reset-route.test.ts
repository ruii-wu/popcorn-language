// tests/integration/system-reset-route.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST } from '@/app/api/system/reset/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w6_reset_route__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const post = (uid: string, body: unknown) =>
  new Request('http://x/', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${uid}` }, body: JSON.stringify(body) });

describe('POST /api/system/reset', () => {
  it('401s without a cookie', async () => {
    const res = await POST(new Request('http://x/', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });

  it('400s without confirm:true', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const res = await POST(post(user.id, { confirm: false }));
    expect(res.status).toBe(400);
    await prisma.user.deleteMany({ where: { username: U } });
  });

  it('wipes content and returns ok when confirmed', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.activityEvent.create({ data: { userId: user.id, type: 'message_sent' } });
    await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });

    const res = await POST(post(user.id, { confirm: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await prisma.activityEvent.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.thread.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
  });
});
