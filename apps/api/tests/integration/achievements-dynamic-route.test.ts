// tests/integration/achievements-dynamic-route.test.ts
import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST } from '@/app/api/achievements/generate/route';
import { GET } from '@/app/api/achievements/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const UA = '__w8_ach_route_a__';
const UB = '__w8_ach_route_b__';

afterAll(async () => {
  for (const name of [UA, UB]) {
    const u = await prisma.user.findFirst({ where: { username: name } });
    if (u) {
      const mine = await prisma.userAchievement.findMany({ where: { userId: u.id } });
      await prisma.user.deleteMany({ where: { username: name } });
      await prisma.achievementDef.deleteMany({ where: { id: { in: mine.map((m) => m.achievementId) }, isDynamic: true } });
    }
  }
  await prisma.$disconnect();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const get = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });
const post = (uid: string) => new Request('http://x/', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

// Stub global fetch so the route's real OllamaClient.chatJson (POST /api/chat, format:json) returns a fixed JSON.
function stubChat(content: object) {
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/api/chat')) {
      return new Response(JSON.stringify({ message: { content: JSON.stringify(content) } }), { status: 200 });
    }
    throw new Error(`unexpected ${u}`);
  }));
}

describe('dynamic achievement route + isolation', () => {
  it('POST 401s without a cookie', async () => {
    expect((await POST(new Request('http://x/', { method: 'POST' }))).status).toBe(401);
  });

  it('POST generates an achievement that shows for the owner but NOT for another user', async () => {
    const a = await prisma.user.create({ data: { username: UA, password: 'pw' } });
    const b = await prisma.user.create({ data: { username: UB, password: 'pw' } });

    stubChat({ title: 'Daily Devotee', description: 'You keep showing up.', icon: '🔥' });
    const res = await POST(post(a.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.achievement.title).toBe('Daily Devotee');

    // owner A sees it (unlocked)
    const aList = await (await GET(get(a.id))).json();
    const aDyn = aList.find((x: { title: string }) => x.title === 'Daily Devotee');
    expect(aDyn).toBeTruthy();
    expect(aDyn.unlocked).toBe(true);

    // user B does NOT see A's dynamic achievement (isolation)
    const bList = await (await GET(get(b.id))).json();
    expect(bList.some((x: { title: string }) => x.title === 'Daily Devotee')).toBe(false);
    // B still sees the static defs
    expect(bList.some((x: { id: string }) => x.id === 'first_chat')).toBe(true);
  });

  it('POST returns { achievement: null } gracefully when the LLM is down', async () => {
    const a = await prisma.user.findFirstOrThrow({ where: { username: UA } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const res = await POST(post(a.id));
    expect(res.status).toBe(200);
    expect((await res.json()).achievement).toBeNull();
  });
});
