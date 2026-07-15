import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DELETE } from '@/app/api/threads/[npcId]/messages/[msgId]/route';
import { POST as RESTORE } from '@/app/api/threads/[npcId]/messages/[msgId]/route';
import { GET } from '@/app/api/threads/[npcId]/messages/route';
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
    const message = await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'please retract me' } });
    const following = await prisma.message.create({ data: { threadId: thread.id, userId: null, role: 'npc', text: 'remove me too' } });

    const response = await DELETE(req(user.id), { params: { npcId: 'lily', msgId: message.id } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, removedAfter: 1 });

    const stored = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(stored.text).toBe('please retract me');
    expect(stored.retractedAt).not.toBeNull();
    expect((await prisma.message.findUniqueOrThrow({ where: { id: following.id } })).hiddenAt).not.toBeNull();

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
    const restoredBody = await restoredHistory.json() as { messages: Array<{ text: string; retracted: boolean }> };
    expect(restoredBody.messages.map((item) => item.text)).toEqual(['please retract me', 'remove me too']);
    expect(restoredBody.messages.some((item) => item.retracted)).toBe(false);
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
});
