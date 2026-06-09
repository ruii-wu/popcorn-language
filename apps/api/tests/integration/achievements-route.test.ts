import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w5_achievements_route_user__';

let GET: typeof import('@/app/api/achievements/route').GET;
beforeAll(async () => { ({ GET } = await import('@/app/api/achievements/route')); });
afterAll(async () => { await prisma.user.deleteMany({ where: { username: U } }); await prisma.$disconnect(); });

describe('GET /api/achievements', () => {
  it('returns every enabled def with the caller\'s unlock state', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.userAchievement.create({ data: { userId: user.id, achievementId: 'first_chat' } });

    const req = new Request('http://t/api/achievements', { headers: { cookie: `${SESSION_COOKIE}=${user.id}` } });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string; unlocked: boolean; unlockedAt: string | null }[];

    const first = body.find((a) => a.id === 'first_chat')!;
    expect(first.unlocked).toBe(true);
    expect(first.unlockedAt).not.toBeNull();
    const locked = body.find((a) => a.id === 'three_friends')!;
    expect(locked.unlocked).toBe(false);
    expect(locked.unlockedAt).toBeNull();
  });

  it('401s without a session cookie', async () => {
    const res = await GET(new Request('http://t/api/achievements'));
    expect(res.status).toBe(401);
  });
});
