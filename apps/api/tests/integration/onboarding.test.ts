import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST } from '@/app/api/onboarding/complete/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w2_onboarding_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const post = (uid: string) =>
  new Request('http://x/', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${uid}` }, body: '{}' });

describe('onboarding complete', () => {
  it('inits Lily relationship + thread + intro message, idempotently', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });

    const first = await (await POST(post(user.id))).json();
    expect(first.npc).toBe('lily');
    expect(first.firstMessageId).toBeTruthy();

    const rel = await prisma.relationship.findUnique({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel?.stage).toBe('friend');
    expect(rel?.stageValue).toBe(2);
    expect(rel?.relationshipPoints).toBe(30);
    const intro = await prisma.message.findUnique({ where: { id: first.firstMessageId } });
    expect(intro?.role).toBe('npc');
    expect(intro?.text.length).toBeGreaterThan(0);

    // calling again does not duplicate the intro message
    const second = await (await POST(post(user.id))).json();
    expect(second.firstMessageId).toBe(first.firstMessageId);
    const count = await prisma.message.count({ where: { thread: { userId: user.id, npcId: 'lily' } } });
    expect(count).toBe(1);
  });

  it('provisions a UserSettings row so the Settings page has persisted state', async () => {
    const U2 = '__w6_onboarding_settings__';
    await prisma.user.deleteMany({ where: { username: U2 } });
    const user = await prisma.user.create({ data: { username: U2, password: 'pw' } });
    expect(await prisma.userSettings.count({ where: { userId: user.id } })).toBe(0);

    await POST(post(user.id));

    const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    expect(settings).not.toBeNull();
    expect(settings?.memoryStrategy).toBe('hybrid');
    await prisma.user.deleteMany({ where: { username: U2 } });
  });
});
