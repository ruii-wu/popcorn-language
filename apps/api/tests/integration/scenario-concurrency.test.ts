import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { acceptScenario } from '@/server/scenario/accept';
import { runScenarioTurn } from '@/server/scenario/turn';
import { abortScenario, pauseScenario, resumeScenario, declineScenario } from '@/server/scenario/lifecycle';
import { runScenarioEnd } from '@/server/scenario/end';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const prefix = '__scenario_concurrency__';
let counter = 0;
afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: prefix } } });
  await prisma.$disconnect();
});

async function fixture(status = 'active', hidden = false) {
  const user = await prisma.user.create({ data: { username: prefix + (++counter), password: 'test' } });
  const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
  await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
  const session = await prisma.scenarioSession.create({ data: {
    userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status,
    hiddenAt: hidden ? new Date() : null,
    state: JSON.stringify({ impression: 5, stress: 'Medium', turnsLeft: 6, turnIndex: 0 }),
  } });
  return { prisma, userId: user.id, sessionId: session.id };
}

const turn = {
  npcReply: 'Can you describe your experience?',
  stateDelta: { impression: 1, stress: 'Medium' },
  isFinalTurn: false,
  suggestedChoicesNext: [{ id: 'a', text: 'I led a project last year.', tone: 'Specific', desc: '' }],
};
function modelGate(expected = 1) {
  let arrived = 0;
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  return { ready, release, ollama: {
    chatJson: async <T>() => { if (++arrived === expected) entered(); await gate; return turn as T; },
    embed: async () => [1, 0],
  } };
}
async function collect(gen: AsyncIterable<SseEvent>) {
  const events: SseEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

describe('Scenario generation commit guards', () => {
  it('commits one concurrent turn without orphan messages', async () => {
    const deps = await fixture();
    const model = modelGate(2);
    const requests = ['First answer', 'Second answer'].map((text) => collect(runScenarioTurn({ ...deps, ollama: model.ollama, text })));
    await model.ready;
    expect(await prisma.message.count({ where: { scenarioSessionId: deps.sessionId } })).toBe(0);
    model.release();
    const results = await Promise.all(requests);
    expect(results.filter((events) => events.some((e) => e.event === 'message_complete'))).toHaveLength(1);
    expect(results.filter((events) => events.some((e) => e.event === 'error'))).toHaveLength(1);
    expect(await prisma.message.count({ where: { scenarioSessionId: deps.sessionId } })).toBe(2);
    expect(await prisma.scenarioTurn.count({ where: { sessionId: deps.sessionId } })).toBe(1);
    expect(JSON.parse((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: deps.sessionId } })).state).turnIndex).toBe(1);
  });

  it('rolls back messages and state if the turn insert fails', async () => {
    const deps = await fixture();
    await prisma.scenarioTurn.create({ data: { sessionId: deps.sessionId, turnIndex: 1 } });
    const model = modelGate();
    const request = collect(runScenarioTurn({ ...deps, ollama: model.ollama, text: 'An answer' }));
    await model.ready;
    model.release();
    await expect(request).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma.message.count({ where: { scenarioSessionId: deps.sessionId } })).toBe(0);
    expect(JSON.parse((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: deps.sessionId } })).state).turnIndex).toBe(0);
  });

  it.each(['abort', 'hide', 'pause'])('discards a turn after %s during generation', async (action) => {
    const deps = await fixture();
    const model = modelGate();
    const request = collect(runScenarioTurn({ ...deps, ollama: model.ollama, text: 'An answer' }));
    await model.ready;
    if (action === 'abort') await abortScenario(deps);
    else if (action === 'pause') await pauseScenario(deps);
    else await prisma.scenarioSession.update({ where: { id: deps.sessionId }, data: { hiddenAt: new Date() } });
    model.release();
    expect((await request).some((e) => e.event === 'error')).toBe(true);
    expect(await prisma.message.count({ where: { scenarioSessionId: deps.sessionId } })).toBe(0);
    expect(await prisma.scenarioTurn.count({ where: { sessionId: deps.sessionId } })).toBe(0);
  });

  it.each(['abort', 'decline', 'hide'])('does not activate an invitation after %s', async (action) => {
    const deps = await fixture('invited');
    const model = modelGate();
    const request = acceptScenario({ ...deps, ollama: model.ollama });
    await model.ready;
    if (action === 'abort') await abortScenario(deps);
    else if (action === 'decline') await declineScenario(deps);
    else await prisma.scenarioSession.update({ where: { id: deps.sessionId }, data: { hiddenAt: new Date() } });
    model.release();
    await expect(request).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await prisma.message.count({ where: { scenarioSessionId: deps.sessionId } })).toBe(0);
    expect(await prisma.scenarioTurn.count({ where: { sessionId: deps.sessionId } })).toBe(0);
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: deps.sessionId } })).status).not.toBe('active');
  });

  it('accepts concurrent invitations only once', async () => {
    const deps = await fixture('invited');
    const model = modelGate(2);
    const requests = [acceptScenario({ ...deps, ollama: model.ollama }), acceptScenario({ ...deps, ollama: model.ollama })];
    const outcomes = Promise.allSettled(requests);
    await model.ready;
    model.release();
    expect((await outcomes).filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.message.count({ where: { scenarioSessionId: deps.sessionId } })).toBe(1);
    expect(await prisma.activityEvent.count({ where: { userId: deps.userId, type: 'scenario_accepted' } })).toBe(1);
  });

  it('rejects hidden turns and all hidden lifecycle mutations', async () => {
    const active = await fixture('active', true);
    const invited = await fixture('invited', true);
    const paused = await fixture('paused', true);
    const model = modelGate();
    const events = await collect(runScenarioTurn({ ...active, ollama: model.ollama, text: 'Hidden' }));
    expect(events.map((e) => e.event)).toEqual(['error', 'done']);
    await Promise.all([
      acceptScenario({ ...invited, ollama: model.ollama }),
      declineScenario(invited), pauseScenario(active), resumeScenario(paused), abortScenario(active),
    ].map((request) => expect(request).rejects.toMatchObject({ code: 'NOT_FOUND' })));
    expect(await prisma.message.count({ where: { scenarioSessionId: active.sessionId } })).toBe(0);
  });

  it('does not commit a summary when a session is hidden during evaluation', async () => {
    const deps = await fixture();
    const session = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: deps.sessionId }, include: { template: true, npc: true } });
    const ollama = { chatJson: async <T>() => {
      await prisma.scenarioSession.update({ where: { id: deps.sessionId }, data: { hiddenAt: new Date() } });
      return { grade: 'A', languageNote: 'Good', pragmaticsNote: '', relationshipNote: '' } as T;
    }, embed: async () => [1, 0] };
    await expect(collect(runScenarioEnd({ prisma, session, state: JSON.parse(session.state), ollama }))).rejects.toThrow();
    expect(await prisma.scenarioSummary.count({ where: { sessionId: session.id } })).toBe(0);
    expect(await prisma.learningSignal.count({ where: { scenarioSessionId: session.id } })).toBe(0);
  });
});
