// src/server/scenario/lifecycle.ts
import type { PrismaClient } from '@prisma/client';
import { canTransition } from './transitions';
import { ScenarioError } from './accept';

interface LifecycleDeps {
  prisma: PrismaClient;
  userId: string;
  sessionId: string;
  reason?: string;
}

async function ownedSession(prisma: PrismaClient, userId: string, sessionId: string) {
  const s = await prisma.scenarioSession.findFirst({ where: { id: sessionId, userId } });
  if (!s) throw new ScenarioError('NOT_FOUND', 'Scenario session not found');
  return s;
}

function assertTransition(from: string, to: string) {
  if (!canTransition(from, to)) throw new ScenarioError('CONFLICT', `cannot move from "${from}" to "${to}"`);
}

export async function declineScenario(deps: LifecycleDeps): Promise<void> {
  const s = await ownedSession(deps.prisma, deps.userId, deps.sessionId);
  assertTransition(s.status, 'declined');
  await deps.prisma.scenarioSession.update({
    where: { id: s.id },
    data: { status: 'declined', declineReason: deps.reason ?? null, endedAt: new Date() },
  });
  await deps.prisma.relationship.updateMany({
    where: { userId: deps.userId, npcId: s.npcId },
    data: { declineCount: { increment: 1 } },
  });
  await deps.prisma.activityEvent.create({
    data: { userId: deps.userId, type: 'scenario_declined', payload: JSON.stringify({ sessionId: s.id }) },
  });
}

export async function pauseScenario(deps: LifecycleDeps): Promise<void> {
  const s = await ownedSession(deps.prisma, deps.userId, deps.sessionId);
  assertTransition(s.status, 'paused');
  await deps.prisma.scenarioSession.update({ where: { id: s.id }, data: { status: 'paused' } });
}

export async function resumeScenario(deps: LifecycleDeps): Promise<void> {
  const s = await ownedSession(deps.prisma, deps.userId, deps.sessionId);
  assertTransition(s.status, 'active');
  await deps.prisma.scenarioSession.update({ where: { id: s.id }, data: { status: 'active' } });
}

export async function abortScenario(deps: LifecycleDeps): Promise<void> {
  const s = await ownedSession(deps.prisma, deps.userId, deps.sessionId);
  assertTransition(s.status, 'aborted');
  await deps.prisma.scenarioSession.update({ where: { id: s.id }, data: { status: 'aborted', endedAt: new Date() } });
}
