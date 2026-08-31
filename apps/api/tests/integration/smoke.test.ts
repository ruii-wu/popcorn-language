// tests/integration/smoke.test.ts — end-to-end REST happy path, no Ollama.
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as onboardingComplete } from '@/app/api/onboarding/complete/route';
import { GET as npcs } from '@/app/api/npcs/route';
import { GET as npcDetail } from '@/app/api/npcs/[id]/route';
import { GET as journeySummary } from '@/app/api/journey/summary/route';
import { GET as achievements } from '@/app/api/achievements/route';
import { GET as getSettings, PUT as putSettings } from '@/app/api/settings/route';
import { GET as memories } from '@/app/api/memories/route';
import { POST as systemReset } from '@/app/api/system/reset/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w9_smoke__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const withCookie = (uid: string, init: RequestInit = {}) =>
  new Request('http://x/', {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      cookie: `${SESSION_COOKIE}=${uid}`,
      'content-type': 'application/json',
    },
  });

describe('whole-system smoke (REST happy path)', () => {
  it('register → onboarding → reads → settings → reset all succeed and are wired together', async () => {
    // register (pre-auth) — returns userId + Set-Cookie
    const reg = await register(
      new Request('http://x/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: U, password: 'pw' }),
      }),
    );
    expect(reg.status).toBe(200);
    const userId = (await reg.json()).userId as string;
    expect(userId).toBeTruthy();

    // onboarding initialises the Lily relationship + intro message
    const ob = await onboardingComplete(withCookie(userId, { method: 'POST', body: '{}' }));
    expect(ob.status).toBe(200);
    expect((await ob.json()).npc).toBe('lily');

    // npc list + detail
    const npcList = await (await npcs(withCookie(userId))).json();
    expect(npcList.map((n: { id: string }) => n.id).sort()).toEqual(['chen', 'emma', 'lily']);
    expect((await npcDetail(withCookie(userId), { params: { id: 'lily' } })).status).toBe(200);

    // journey summary has the expected shape
    const summary = await (await journeySummary(withCookie(userId))).json();
    for (const key of ['days', 'practiceTurns', 'scenarios', 'memories'])
      expect(summary).toHaveProperty(key);

    // achievements list includes the static defs
    const achList = await (await achievements(withCookie(userId))).json();
    expect(achList.some((a: { id: string }) => a.id === 'first_chat')).toBe(true);

    // settings read + write (live memoryStrategy switch)
    const s0 = await (await getSettings(withCookie(userId))).json();
    expect(s0).toHaveProperty('memoryStrategy');
    const s1 = await putSettings(
      withCookie(userId, { method: 'PUT', body: JSON.stringify({ memoryStrategy: 'semantic' }) }),
    );
    expect(s1.status).toBe(200);
    expect(
      (await prisma.userSettings.findUniqueOrThrow({ where: { userId } })).memoryStrategy,
    ).toBe('semantic');

    // memories read
    expect(Array.isArray(await (await memories(withCookie(userId))).json())).toBe(true);

    // reset wipes content but keeps identity (user row + UserSettings survive per resetUserData)
    const reset = await systemReset(
      withCookie(userId, { method: 'POST', body: JSON.stringify({ confirm: true }) }),
    );
    expect(reset.status).toBe(200);
    expect(await prisma.user.count({ where: { id: userId } })).toBe(1);
  });
});
