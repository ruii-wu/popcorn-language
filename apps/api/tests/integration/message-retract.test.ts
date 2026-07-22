import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DELETE } from '@/app/api/threads/[npcId]/messages/[msgId]/route';
import { POST as RESTORE } from '@/app/api/threads/[npcId]/messages/[msgId]/route';
import { GET } from '@/app/api/threads/[npcId]/messages/route';
import { GET as GET_SESSION } from '@/app/api/scenarios/sessions/[id]/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w10_retract_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: U } } });
  await prisma.$disconnect();
});

function req(userId: string) {
  return new Request('http://x/', {
    method: 'DELETE',
    headers: { cookie: `${SESSION_COOKIE}=${userId}` },
  });
}

function getReq(userId: string) {
  return new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${userId}` } });
}

describe('message retract', () => {
  it('retracts an owned message and hides everything after it', async () => {
    const user = await prisma.user.create({ data: { username: U + '_owner', password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    const createdAt = new Date('2026-07-22T00:00:00.000Z');
    const correction = JSON.stringify({ tag: 'Grammar', fixed: 'Please retract me.', noteZh: 'Add punctuation.' });
    const message = await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'please retract me', correction, createdAt } });
    const following = await prisma.message.create({ data: { threadId: thread.id, userId: null, role: 'npc', text: 'remove me too', createdAt } });

    const response = await DELETE(req(user.id), { params: { npcId: 'lily', msgId: message.id } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, removedAfter: 1 });

    const stored = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(stored.text).toBe('please retract me');
    expect(stored.retractedAt).not.toBeNull();
    expect(stored.correction).toBe(correction);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: following.id } })).hiddenAt).not.toBeNull();

    const repeated = await DELETE(req(user.id), { params: { npcId: 'lily', msgId: message.id } });
    expect(repeated.status).toBe(404);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).retractedAt?.getTime())
      .toBe(stored.retractedAt?.getTime());

    const history = await GET(getReq(user.id), { params: { npcId: 'lily' } });
    const body = await history.json() as { messages: Array<{ text: string; retracted: boolean; retractedText: string | null }> };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]).toMatchObject({ text: 'Message retracted', retracted: true, retractedText: 'please retract me' });

    const restoreResponse = await RESTORE(req(user.id), { params: { npcId: 'lily', msgId: message.id } });
    expect(restoreResponse.status).toBe(200);
    expect(await restoreResponse.json()).toEqual({ ok: true, restoredAfter: 1 });

    const restored = await prisma.message.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: 'asc' } });
    expect(restored).toHaveLength(2);
    expect(restored[0].retractedAt).toBeNull();
    expect(restored[1].hiddenAt).toBeNull();

    const restoredHistory = await GET(getReq(user.id), { params: { npcId: 'lily' } });
    const restoredBody = await restoredHistory.json() as { messages: Array<{ text: string; retracted: boolean; correction: unknown }> };
    expect(restoredBody.messages.map((item) => item.text)).toEqual(['please retract me', 'remove me too']);
    expect(restoredBody.messages.some((item) => item.retracted)).toBe(false);
    expect(restoredBody.messages[0].correction).toEqual(JSON.parse(correction));
  });

  it('does not allow another user or a scenario turn to retract the message', async () => {
    const owner = await prisma.user.create({ data: { username: U + '_owner2', password: 'pw' } });
    const stranger = await prisma.user.create({ data: { username: U + '_stranger', password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: owner.id, npcId: 'lily' } });
    const message = await prisma.message.create({ data: { threadId: thread.id, userId: owner.id, role: 'user', text: 'keep me' } });

    const foreign = await DELETE(req(stranger.id), { params: { npcId: 'lily', msgId: message.id } });
    expect(foreign.status).toBe(404);

    const session = await prisma.scenarioSession.create({
      data: { userId: owner.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'active' },
    });
    const scenarioMessage = await prisma.message.create({
      data: { threadId: thread.id, userId: owner.id, role: 'user', text: 'scenario answer', scenarioSessionId: session.id },
    });
    const scenarioResponse = await DELETE(req(owner.id), { params: { npcId: 'lily', msgId: scenarioMessage.id } });
    expect(scenarioResponse.status).toBe(404);
  });

  it('restores only rows owned by that retract when recalls are nested', async () => {
    const user = await prisma.user.create({ data: { username: U + '_nested', password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    const base = Date.parse('2026-07-22T01:00:00.000Z');
    const a = await prisma.message.create({
      data: { threadId: thread.id, userId: user.id, role: 'user', text: 'A', createdAt: new Date(base) },
    });
    const b = await prisma.message.create({
      data: { threadId: thread.id, userId: null, role: 'npc', text: 'B', createdAt: new Date(base + 1_000) },
    });
    const c = await prisma.message.create({
      data: { threadId: thread.id, userId: user.id, role: 'user', text: 'C', createdAt: new Date(base + 2_000) },
    });
    const d = await prisma.message.create({
      data: { threadId: thread.id, userId: null, role: 'npc', text: 'D', createdAt: new Date(base + 3_000) },
    });
    const scenario = await prisma.scenarioSession.create({
      data: {
        userId: user.id,
        npcId: 'lily',
        threadId: thread.id,
        templateId: 'mock_interview',
        status: 'active',
        invitedAt: new Date(base + 4_000),
      },
    });

    expect((await DELETE(req(user.id), { params: { npcId: 'lily', msgId: c.id } })).status).toBe(200);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: d.id } })).hiddenByMessageId).toBe(c.id);
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: scenario.id } })).hiddenByMessageId).toBe(c.id);

    expect((await DELETE(req(user.id), { params: { npcId: 'lily', msgId: a.id } })).status).toBe(200);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: b.id } })).hiddenByMessageId).toBe(a.id);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: c.id } })).hiddenByMessageId).toBe(a.id);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: d.id } })).hiddenByMessageId).toBe(c.id);
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: scenario.id } })).hiddenByMessageId).toBe(c.id);

    expect((await RESTORE(req(user.id), { params: { npcId: 'lily', msgId: a.id } })).status).toBe(200);
    const cAfterA = await prisma.message.findUniqueOrThrow({ where: { id: c.id } });
    expect(cAfterA.hiddenAt).toBeNull();
    expect(cAfterA.retractedAt).not.toBeNull();
    expect((await prisma.message.findUniqueOrThrow({ where: { id: d.id } })).hiddenAt).not.toBeNull();
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: scenario.id } })).hiddenAt).not.toBeNull();

    expect((await RESTORE(req(user.id), { params: { npcId: 'lily', msgId: c.id } })).status).toBe(200);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: d.id } })).hiddenAt).toBeNull();
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: scenario.id } })).hiddenAt).toBeNull();
  });

  it('hides and restores a completed scenario card and its transcript as one rollback unit', async () => {
    const user = await prisma.user.create({ data: { username: U + '_completed', password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    const base = Date.parse('2026-07-22T02:00:00.000Z');
    const message = await prisma.message.create({
      data: { threadId: thread.id, userId: user.id, role: 'user', text: 'start here', createdAt: new Date(base) },
    });
    const scenario = await prisma.scenarioSession.create({
      data: {
        userId: user.id,
        npcId: 'lily',
        threadId: thread.id,
        templateId: 'mock_interview',
        status: 'completed',
        invitedAt: new Date(base + 1_000),
        startedAt: new Date(base + 2_000),
        endedAt: new Date(base + 4_000),
      },
    });
    await prisma.message.create({
      data: {
        threadId: thread.id,
        userId: null,
        role: 'npc',
        text: 'Scenario transcript',
        scenarioSessionId: scenario.id,
        createdAt: new Date(base + 3_000),
      },
    });

    const before = await GET(getReq(user.id), { params: { npcId: 'lily' } });
    const beforeBody = await before.json() as { messages: Array<{ id: string }> };
    expect(beforeBody.messages.map((item) => item.id)).toContain(`scenario:${scenario.id}`);

    expect((await DELETE(req(user.id), { params: { npcId: 'lily', msgId: message.id } })).status).toBe(200);
    const hidden = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: scenario.id } });
    expect(hidden.hiddenByMessageId).toBe(message.id);

    const hiddenHistory = await GET(getReq(user.id), { params: { npcId: 'lily' } });
    const hiddenBody = await hiddenHistory.json() as { messages: Array<{ id: string }> };
    expect(hiddenBody.messages.map((item) => item.id)).not.toContain(`scenario:${scenario.id}`);
    expect((await GET_SESSION(getReq(user.id), { params: { id: scenario.id } })).status).toBe(404);

    expect((await RESTORE(req(user.id), { params: { npcId: 'lily', msgId: message.id } })).status).toBe(200);
    const restoredHistory = await GET(getReq(user.id), { params: { npcId: 'lily' } });
    const restoredBody = await restoredHistory.json() as { messages: Array<{ id: string }> };
    expect(restoredBody.messages.map((item) => item.id)).toContain(`scenario:${scenario.id}`);
    const restoredDetail = await GET_SESSION(getReq(user.id), { params: { id: scenario.id } });
    expect(restoredDetail.status).toBe(200);
    expect((await restoredDetail.json()).transcript).toHaveLength(1);
  });
});
