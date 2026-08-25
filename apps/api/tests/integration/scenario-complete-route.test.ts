import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SESSION_COOKIE } from '@/server/auth/session';

const llm = vi.hoisted(() => ({
  chatJson: vi.fn(),
  embed: vi.fn(),
}));
vi.mock('@/server/llm/userClient', () => ({
  ollamaForUser: vi.fn().mockResolvedValue(llm),
}));

import { POST } from '@/app/api/scenarios/sessions/[id]/complete/route';

const prisma = new PrismaClient();
const U = '__scenario_complete_route_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('POST /api/scenarios/sessions/:id/complete', () => {
  it('retries only the completion tail for a durable final turn', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    llm.chatJson.mockReset();
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
    const session = await prisma.scenarioSession.create({
      data: {
        userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'active',
        state: JSON.stringify({ impression: 6, stress: 'Low', turnsLeft: 0, turnIndex: 3 }),
      },
    });
    await prisma.message.create({
      data: { threadId: thread.id, userId: user.id, role: 'user', text: 'My final answer.', scenarioSessionId: session.id },
    });
    llm.chatJson
      .mockResolvedValueOnce({
        grade: 'B+', languageNote: 'Clear.', pragmaticsNote: 'Polite.', relationshipNote: 'Warm.', skillAssessments: [],
      })
      .mockResolvedValueOnce({ title: 'Clear Communicator', body: 'Finished the practice clearly.' });

    const req = new Request('http://test/api/scenarios/sessions/' + session.id + '/complete', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE}=${user.id}` },
    });
    const response = await POST(req, { params: { id: session.id } });
    const stream = await response.text();

    expect(response.status).toBe(200);
    expect(stream).toContain('event: scenario_end');
    expect(stream).toContain('event: done');
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('completed');
    expect(await prisma.scenarioSummary.count({ where: { sessionId: session.id } })).toBe(1);
  });

  it('compensates a missing Memory without re-evaluating a completed session', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    llm.chatJson.mockReset();
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    const session = await prisma.scenarioSession.create({
      data: {
        userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'completed',
        state: JSON.stringify({ impression: 6, stress: 'Low', turnsLeft: 0, turnIndex: 3 }),
      },
    });
    await prisma.scenarioSummary.create({
      data: {
        sessionId: session.id, grade: 'B+', languageNote: 'Persisted.', pragmaticsNote: 'Polite.', relationshipNote: 'Warm.',
      },
    });
    llm.chatJson.mockResolvedValueOnce({ title: 'Recovered Memory', body: 'Recovered after a transient failure.' });

    const req = new Request('http://test/api/scenarios/sessions/' + session.id + '/complete', {
      method: 'POST',
      headers: { cookie: `${SESSION_COOKIE}=${user.id}` },
    });
    const response = await POST(req, { params: { id: session.id } });
    const stream = await response.text();

    expect(stream).toContain('event: scenario_end');
    expect(llm.chatJson).toHaveBeenCalledTimes(1); // Memory only; persisted Summary is reused.
    expect(await prisma.memory.count({ where: { userId: user.id, sourceRef: session.id } })).toBe(1);
    expect(await prisma.scenarioSummary.count({ where: { sessionId: session.id } })).toBe(1);
  });
});
