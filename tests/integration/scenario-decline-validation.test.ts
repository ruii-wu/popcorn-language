// tests/integration/scenario-decline-validation.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST as decline } from '@/app/api/scenarios/sessions/[id]/decline/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w9_decline_val__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

function req(uid: string, body: unknown) {
  return new Request('http://x/', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${uid}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('decline route input validation', () => {
  it('rejects a non-object body with 400 BAD_REQUEST', async () => {
    const u = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const res = await decline(req(u.id, 'not-an-object'), { params: { id: 'whatever' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('BAD_REQUEST');
  });

  it('declines a real invited session with an optional reason', async () => {
    const u = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const thread = await prisma.thread.create({ data: { userId: u.id, npcId: 'lily' } });
    const sess = await prisma.scenarioSession.create({ data: { userId: u.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'invited' } });
    const res = await decline(req(u.id, { reason: 'busy now' }), { params: { id: sess.id } });
    expect(res.status).toBe(200);
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: sess.id } })).status).toBe('declined');
  });
});
