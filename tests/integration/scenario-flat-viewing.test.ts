// tests/integration/scenario-flat-viewing.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { judgeScenarioTrigger } from '@/server/scenario/trigger';
import { acceptScenario } from '@/server/scenario/accept';

const prisma = new PrismaClient();
const U = '__w8_flat_viewing__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

async function warmedThread(userTurns: number) {
  await prisma.user.deleteMany({ where: { username: U } });
  const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
  const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'emma' } });
  await prisma.relationship.create({ data: { userId: user.id, npcId: 'emma', stage: 'friend', stageValue: 2 } });
  for (let i = 0; i < userTurns; i++) {
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: `m${i}` } });
  }
  return { user, thread };
}

describe('Flat Viewing scenario (emma)', () => {
  it('is seeded, enabled, and bound to emma via the flat_host role', async () => {
    const t = await prisma.scenarioTemplate.findUnique({ where: { id: 'flat_viewing' } });
    expect(t).not.toBeNull();
    expect(t?.npcId).toBe('emma');
    expect(t?.enabled).toBe(true);
    expect(t?.rolePlayedBy).toBe('flat_host');

    const emma = await prisma.npc.findUniqueOrThrow({ where: { id: 'emma' } });
    const roles = JSON.parse(emma.scenarioRoles) as { id: string }[];
    expect(roles.some((r) => r.id === 'flat_host')).toBe(true);
  });

  it('triggers for emma when warmed up, at friend stage, on a housing keyword', async () => {
    const { user, thread } = await warmedThread(4);
    const hit = await judgeScenarioTrigger({
      prisma, userId: user.id, npcId: 'emma', threadId: thread.id,
      text: 'could we practise a flat viewing? i need to find a room',
    });
    expect(hit?.template.id).toBe('flat_viewing');
    expect(hit?.rationale.topicMatch).toBe('flat');
  });

  it('accepts and opens a roleplay turn with the template turn budget', async () => {
    const { user, thread } = await warmedThread(4);
    const session = await prisma.scenarioSession.create({
      data: { userId: user.id, npcId: 'emma', threadId: thread.id, templateId: 'flat_viewing', status: 'invited' },
    });
    const ollama = {
      chatJson: vi.fn().mockResolvedValue({
        npcReply: 'Hiya! Come in — the room is just down the hall. What sort of budget are you on?',
        stateDelta: { impression: 0, stress: 'Low' },
        isFinalTurn: false,
        suggestedChoicesNext: [{ id: 'c1', text: 'Around £800 a month.', tone: 'Friendly', desc: '' }],
      }),
      embed: vi.fn(),
    };
    const result = await acceptScenario({ prisma, ollama, userId: user.id, sessionId: session.id });
    expect(result.openingMessage.text.length).toBeGreaterThan(0);
    expect(result.state.turnsLeft).toBe(5); // flat_viewing estimatedTurns
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('active');
  });
});
