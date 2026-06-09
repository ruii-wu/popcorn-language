// tests/integration/journey-streak-route.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/journey/streak/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w6_journey_streak__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const get = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('GET /api/journey/streak', () => {
  it('401s without a cookie', async () => {
    expect((await GET(new Request('http://x/'))).status).toBe(401);
  });

  it('returns days, weekCount and a 7-length perDay array', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.activityEvent.create({ data: { userId: user.id, type: 'message_sent' } });

    const res = await GET(get(user.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.perDay).toHaveLength(7);
    expect(body.perDay[6]).toBe(1);
    expect(body.weekCount).toBe(1);
    expect(body.days).toBe(1);
  });
});
