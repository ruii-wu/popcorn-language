// tests/integration/scenario-turn.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runScenarioTurn } from '@/server/scenario/turn';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const U = '__w4_turn_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

async function activeSession(turnsLeft: number, options: { turnIndex?: number; completionPending?: boolean } = {}) {
  await prisma.user.deleteMany({ where: { username: U } });
  const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
  const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
  await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
  const session = await prisma.scenarioSession.create({
    data: {
      userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'active',
      startedAt: new Date(), state: JSON.stringify({
        impression: 5,
        stress: 'Medium',
        turnsLeft,
        turnIndex: options.turnIndex ?? 0,
        ...(options.completionPending ? { completionPending: true } : {}),
      }),
    },
  });
  return { user, thread, session };
}

describe('runScenarioTurn (non-final)', () => {
  it('saves the choice, applies the delta, persists a turn, and emits state_update + choices', async () => {
    const { user, session } = await activeSession(4);
    const ollama = {
      chatJson: vi.fn().mockResolvedValue({
        npcReply: 'Good. Why this role?',
        stateDelta: { impression: 2, stress: 'High' },
        isFinalTurn: false,
        suggestedChoicesNext: [
          { id: 'a', text: 'Because I love it', tone: 'Confident', desc: '' },
          { id: 'b', text: 'It pays well', tone: 'Blunt', desc: '' },
        ],
      }),
      embed: vi.fn(),
    };

    const events: SseEvent[] = [];
    for await (const e of runScenarioTurn({ prisma, ollama, userId: user.id, sessionId: session.id, choiceId: 'c1', tone: 'Confident', text: 'I am a developer.' })) {
      events.push(e);
    }

    const names = events.map((e) => e.event);
    expect(names[0]).toBe('typing_start');
    expect(names.indexOf('user_message_saved')).toBeLessThan(names.indexOf('message_complete'));
    expect(names).toContain('message_complete');
    const stateUpdate = events.find((e) => e.event === 'state_update')!.data as { impression: number; turnsLeft: number };
    expect(stateUpdate.impression).toBe(7);
    expect(stateUpdate.turnsLeft).toBe(3);
    expect(names).toContain('choices');
    expect(names).not.toContain('scenario_end');
    expect(names[names.length - 1]).toBe('done');

    const reloaded = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(JSON.parse(reloaded.state).turnsLeft).toBe(3);
    const turn1 = await prisma.scenarioTurn.findUniqueOrThrow({ where: { sessionId_turnIndex: { sessionId: session.id, turnIndex: 1 } } });
    expect(turn1.userChoiceId).toBe('c1');
    expect(turn1.userMessageId).not.toBeNull();
  });

  it('emits an error (not a throw) for a non-active or foreign session', async () => {
    const { user, session } = await activeSession(4);
    await prisma.scenarioSession.update({ where: { id: session.id }, data: { status: 'paused' } });
    const ollama = { chatJson: vi.fn(), embed: vi.fn() };
    const events: SseEvent[] = [];
    for await (const e of runScenarioTurn({ prisma, ollama, userId: user.id, sessionId: session.id, text: 'x' })) events.push(e);
    expect(events.map((e) => e.event)).toContain('error');
    expect(events[events.length - 1].event).toBe('done');
    expect(ollama.chatJson).not.toHaveBeenCalled();
  });

  it('falls back (no throw) and still advances when chatJson fails', async () => {
    const { user, session } = await activeSession(4);
    const ollama = { chatJson: vi.fn().mockRejectedValue(new Error('LLM down')), embed: vi.fn() };
    const events: SseEvent[] = [];
    for await (const e of runScenarioTurn({ prisma, ollama, userId: user.id, sessionId: session.id, text: 'x' })) events.push(e);
    expect(events.map((e) => e.event)).toContain('message_complete');
    expect(events.map((e) => e.event)).toContain('state_update');
    const reloaded = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(JSON.parse(reloaded.state).turnsLeft).toBe(3); // still advanced
  });

  it('continues past the estimated turn target when the exchange is not naturally complete', async () => {
    const { user, session } = await activeSession(0, { turnIndex: 6 });
    const ollama = {
      chatJson: vi.fn().mockResolvedValue({
        npcReply: 'Could you give me one concrete example?',
        stateDelta: { impression: 0, stress: 'Medium' },
        isFinalTurn: false,
        suggestedChoicesNext: [
          { id: 'a', text: 'I led a launch that increased sign-ups.', tone: 'Specific', desc: '' },
          { id: 'b', text: 'I can describe a university campaign.', tone: 'Reflective', desc: '' },
          { id: 'c', text: 'Could I use a volunteer project as an example?', tone: 'Diplomatic', desc: '' },
        ],
      }),
      embed: vi.fn(),
    };
    const events: SseEvent[] = [];
    for await (const event of runScenarioTurn({
      prisma, ollama, userId: user.id, sessionId: session.id, text: 'I enjoy collaborative work.',
    })) events.push(event);

    expect(events.map((event) => event.event)).toContain('choices');
    expect(events.map((event) => event.event)).not.toContain('scenario_end');
    const reloaded = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(reloaded.status).toBe('active');
    expect(JSON.parse(reloaded.state)).toMatchObject({ turnsLeft: 0, turnIndex: 7, completionPending: false });
  });

  it('uses a natural fallback closing at the hard safety limit', async () => {
    const { user, session } = await activeSession(0, { turnIndex: 8 });
    const ollama = { chatJson: vi.fn().mockRejectedValue(new Error('LLM down')), embed: vi.fn() };
    const events: SseEvent[] = [];
    for await (const event of runScenarioTurn({
      prisma, ollama, userId: user.id, sessionId: session.id, text: 'That covers my experience.',
    })) events.push(event);

    expect(events.map((event) => event.event)).toContain('scenario_end');
    const closing = await prisma.message.findFirstOrThrow({
      where: { scenarioSessionId: session.id, role: 'npc-roleplay' },
      orderBy: { createdAt: 'desc' },
    });
    expect(closing.text).toContain('wrap up here');
    expect(closing.text).not.toContain('?');
  });

  it('does not persist an extra turn when completion is waiting to be retried', async () => {
    const { user, session } = await activeSession(0, { completionPending: true });
    const ollama = { chatJson: vi.fn(), embed: vi.fn() };
    const events: SseEvent[] = [];
    for await (const event of runScenarioTurn({
      prisma, ollama, userId: user.id, sessionId: session.id, text: 'an unintended extra answer',
    })) events.push(event);

    expect(events.find((event) => event.event === 'error')?.data).toEqual(expect.objectContaining({ code: 'END_FAILED' }));
    expect(await prisma.message.count({ where: { scenarioSessionId: session.id } })).toBe(0);
    expect(await prisma.scenarioTurn.count({ where: { sessionId: session.id } })).toBe(0);
    expect(ollama.chatJson).not.toHaveBeenCalled();
  });
});
