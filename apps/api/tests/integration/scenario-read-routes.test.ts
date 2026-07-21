// tests/integration/scenario-read-routes.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET as catalogGET } from '@/app/api/scenarios/catalog/route';
import { GET as listGET } from '@/app/api/scenarios/sessions/route';
import { GET as detailGET } from '@/app/api/scenarios/sessions/[id]/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w4_readroutes_user__';

function reqAs(userId: string, url = 'http://test/local'): Request {
  return new Request(url, { headers: { cookie: `${SESSION_COOKIE}=${userId}` } });
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('scenario read routes', () => {
  it('catalog marks eligibility by stage; sessions list + detail are user-scoped', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
    const session = await prisma.scenarioSession.create({
      data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'invited' },
    });
    await prisma.scenarioTurn.create({
      data: {
        sessionId: session.id,
        turnIndex: 0,
        nextChoices: JSON.stringify([{ id: 'c1', text: 'Tell me more.', tone: 'Curious', desc: '' }]),
      },
    });
    const emmaThread = await prisma.thread.create({ data: { userId: user.id, npcId: 'emma' } });
    const emmaSession = await prisma.scenarioSession.create({
      data: { userId: user.id, npcId: 'emma', threadId: emmaThread.id, templateId: 'flat_viewing', status: 'active' },
    });

    const catalog = (await (await catalogGET(reqAs(user.id))).json()) as { id: string; eligible: boolean }[];
    expect(catalog.find((c) => c.id === 'mock_interview')?.eligible).toBe(true);

    const list = (await (await listGET(reqAs(user.id))).json()) as { id: string; scenarioTitle: string }[];
    expect(list.some((s) => s.id === session.id && s.scenarioTitle === 'Mock Interview')).toBe(true);

    const lilyList = (await (await listGET(reqAs(user.id, 'http://test/local?npcId=lily'))).json()) as { id: string; npcId: string }[];
    expect(lilyList.every((s) => s.npcId === 'lily')).toBe(true);
    expect(lilyList.some((s) => s.id === session.id)).toBe(true);
    expect(lilyList.some((s) => s.id === emmaSession.id)).toBe(false);

    const detailRes = await detailGET(reqAs(user.id), { params: { id: session.id } });
    expect(detailRes.status).toBe(200);
    expect(((await detailRes.json()) as { choices: unknown[] }).choices).toHaveLength(1);

    // isolation: a foreign user gets 404 on the detail and an empty list
    const stranger = await prisma.user.create({ data: { username: U + '_x', password: 'pw' } });
    const foreign = await detailGET(reqAs(stranger.id), { params: { id: session.id } });
    expect(foreign.status).toBe(404);
    const strangerList = (await (await listGET(reqAs(stranger.id))).json()) as unknown[];
    expect(strangerList).toHaveLength(0);
    await prisma.user.deleteMany({ where: { username: U + '_x' } });
  });
});
