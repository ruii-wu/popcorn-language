// tests/integration/journey-summary-route.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/journey/summary/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w6_journey_summary__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const get = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('GET /api/journey/summary', () => {
  it('401s without a cookie', async () => {
    expect((await GET(new Request('http://x/'))).status).toBe(401);
  });

  it('aggregates streak days, user-message count, completed scenarios and memories', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'hi' } });
    await prisma.message.create({ data: { threadId: thread.id, userId: null, role: 'npc', text: 'hello' } });
    await prisma.activityEvent.create({ data: { userId: user.id, type: 'message_sent' } });
    await prisma.memory.create({ data: { userId: user.id, title: 't', body: 'b', sourceType: 'chat_pattern' } });

    const res = await GET(get(user.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.practiceTurns).toBe(1);
    expect(body.scenarios).toBe(0);
    expect(body.memories).toBe(1);
    expect(body.days).toBe(1);
  });

  it('does not count retracted messages or hidden completed scenarios', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.message.create({
      data: { threadId: thread.id, userId: user.id, role: 'user', text: 'gone', retractedAt: new Date() },
    });
    await prisma.scenarioSession.create({
      data: {
        userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview',
        status: 'completed', hiddenAt: new Date(),
      },
    });

    const body = await (await GET(get(user.id))).json();
    expect(body.practiceTurns).toBe(0);
    expect(body.scenarios).toBe(0);
    expect(body.days).toBe(0);
  });
});
