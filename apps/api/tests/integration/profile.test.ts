import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET, PUT } from '@/app/api/profile/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w2_profile_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: U } } });
  await prisma.$disconnect();
});

const get = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });
const put = (uid: string, obj: unknown) =>
  new Request('http://x/', { method: 'PUT', headers: { cookie: `${SESSION_COOKIE}=${uid}` }, body: JSON.stringify(obj) });

describe('profile routes', () => {
  it('GET 401s without a cookie', async () => {
    expect((await GET(new Request('http://x/'))).status).toBe(401);
  });

  it('PUT upserts profile + language + cefr, GET reads it back', async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: U } } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });

    const putRes = await PUT(put(user.id, { role: 'Student', goal: 'work', interests: ['coffee', 'music'], language: 'zh-CN', cefrLevel: 'B1' }));
    expect((await putRes.json()).ok).toBe(true);

    const data = await (await GET(get(user.id))).json();
    expect(data).toEqual({ role: 'Student', goal: 'work', interests: ['coffee', 'music'], language: 'zh-CN', cefrLevel: 'B1' });
  });

  it('GET returns defaults when no profile exists', async () => {
    const user = await prisma.user.create({ data: { username: U + '2', password: 'pw' } });
    const data = await (await GET(get(user.id))).json();
    expect(data).toEqual({ role: null, goal: null, interests: [], language: 'zh-CN', cefrLevel: null });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
