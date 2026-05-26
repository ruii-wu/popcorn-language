// tests/integration/scenario-accept.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { acceptScenario } from '@/server/scenario/accept';

const prisma = new PrismaClient();
const U = '__w4_accept_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

async function invitedSession() {
  await prisma.user.deleteMany({ where: { username: U } });
  const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
  const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
  await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
  const session = await prisma.scenarioSession.create({
    data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'invited' },
  });
  return { user, thread, session };
}

describe('acceptScenario', () => {
  it('activates the session, persists state, and creates the opening roleplay turn', async () => {
    const { user, session } = await invitedSession();
    const ollama = {
      chatJson: vi.fn().mockResolvedValue({
        npcReply: 'Welcome. Tell me about yourself.',
        stateDelta: { impression: 0, stress: 'Medium' },
        isFinalTurn: false,
        suggestedChoicesNext: [{ id: 'c1', text: 'I am a developer.', tone: 'Confident', desc: '' }],
      }),
      embed: vi.fn(),
    };

    const result = await acceptScenario({ prisma, ollama, userId: user.id, sessionId: session.id });
    expect(result.openingMessage.text).toContain('Welcome');
    expect(result.choices).toHaveLength(1);
    expect(result.state.turnsLeft).toBe(6); // mock_interview estimatedTurns
    expect(result.state.impression).toBe(5);

    const reloaded = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(reloaded.status).toBe('active');
    expect(reloaded.startedAt).not.toBeNull();

    const turn0 = await prisma.scenarioTurn.findUniqueOrThrow({ where: { sessionId_turnIndex: { sessionId: session.id, turnIndex: 0 } } });
    expect(turn0.npcMessageId).not.toBeNull();
    expect(JSON.parse(turn0.nextChoices!)).toHaveLength(1);

    const accepted = await prisma.activityEvent.count({ where: { userId: user.id, type: 'scenario_accepted' } });
    expect(accepted).toBe(1);
  });

  it('rejects a foreign session (isolation) and a non-invited session', async () => {
    const { session } = await invitedSession();
    const ollama = { chatJson: vi.fn(), embed: vi.fn() };
    await expect(acceptScenario({ prisma, ollama, userId: 'someone-else', sessionId: session.id })).rejects.toThrow(/not found/i);
    await prisma.scenarioSession.update({ where: { id: session.id }, data: { status: 'completed' } });
    const owner = await prisma.user.findFirstOrThrow({ where: { username: U } });
    await expect(acceptScenario({ prisma, ollama, userId: owner.id, sessionId: session.id })).rejects.toThrow(/cannot accept/i);
    expect(ollama.chatJson).not.toHaveBeenCalled();
  });
});
