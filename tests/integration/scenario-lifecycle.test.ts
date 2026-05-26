// tests/integration/scenario-lifecycle.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { declineScenario, pauseScenario, resumeScenario, abortScenario } from '@/server/scenario/lifecycle';
import { ScenarioError } from '@/server/scenario/accept';

const prisma = new PrismaClient();
const U = '__w4_lifecycle_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

async function session(status: string) {
  const user = await prisma.user.upsert({ where: { username: U }, create: { username: U, password: 'pw' }, update: {} });
  const thread = await prisma.thread.upsert({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } }, create: { userId: user.id, npcId: 'lily' }, update: {} });
  await prisma.relationship.upsert({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } }, create: { userId: user.id, npcId: 'lily' }, update: {} });
  const s = await prisma.scenarioSession.create({ data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status } });
  return { user, session: s };
}

describe('scenario lifecycle', () => {
  it('decline records reason + bumps declineCount; only from invited', async () => {
    const { user, session: s } = await session('invited');
    await declineScenario({ prisma, userId: user.id, sessionId: s.id, reason: 'busy' });
    const reloaded = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(reloaded.status).toBe('declined');
    expect(reloaded.declineReason).toBe('busy');
    const rel = await prisma.relationship.findUniqueOrThrow({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel.declineCount).toBe(1);

    const active = await session('active');
    await expect(declineScenario({ prisma, userId: active.user.id, sessionId: active.session.id })).rejects.toBeInstanceOf(ScenarioError);
  });

  it('pause/resume round-trip; abort terminates a non-terminal session', async () => {
    const { user, session: s } = await session('active');
    await pauseScenario({ prisma, userId: user.id, sessionId: s.id });
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('paused');
    await resumeScenario({ prisma, userId: user.id, sessionId: s.id });
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('active');
    await abortScenario({ prisma, userId: user.id, sessionId: s.id });
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('aborted');
  });

  it('rejects a foreign session id (isolation)', async () => {
    const { session: s } = await session('invited');
    await expect(declineScenario({ prisma, userId: 'stranger', sessionId: s.id })).rejects.toThrow(/not found/i);
  });
});
