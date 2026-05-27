// tests/integration/settings-route.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET, PUT } from '@/app/api/settings/route';
import { SESSION_COOKIE } from '@/server/auth/session';
import { DEFAULT_SETTINGS } from '@/server/settings/settings';

const prisma = new PrismaClient();
const U = '__w6_settings_route__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const get = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });
const put = (uid: string, body: unknown) =>
  new Request('http://x/', { method: 'PUT', headers: { cookie: `${SESSION_COOKIE}=${uid}` }, body: JSON.stringify(body) });

describe('settings route', () => {
  it('GET 401s without a cookie', async () => {
    expect((await GET(new Request('http://x/'))).status).toBe(401);
  });

  it('GET returns defaults for a fresh user', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const res = await GET(get(user.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DEFAULT_SETTINGS);
  });

  it('PUT updates memoryStrategy and grammarCorrection, then GET reflects it', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const res = await PUT(put(user.id, { memoryStrategy: 'recency', grammarCorrection: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.settings.memoryStrategy).toBe('recency');
    const after = await (await GET(get(user.id))).json();
    expect(after.memoryStrategy).toBe('recency');
    expect(after.grammarCorrection).toBe(false);
  });

  it('PUT 400s on an invalid memoryStrategy', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const res = await PUT(put(user.id, { memoryStrategy: 'telepathy' }));
    expect(res.status).toBe(400);
  });
});
