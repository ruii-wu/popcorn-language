// tests/integration/scenario-offer.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { maybeOfferScenario } from '@/server/scenario/offer';

const prisma = new PrismaClient();
const U = '__w4_offer_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('maybeOfferScenario', () => {
  it('creates an invited session + invitation message and returns the draft on a hit', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
    for (let i = 0; i < 4; i++) await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: `m${i}` } });

    const offer = await maybeOfferScenario({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'lets do an interview' });
    expect(offer).not.toBeNull();
    expect(offer!.draft.title).toBe('Mock Interview');

    const sess = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: offer!.sessionId } });
    expect(sess.status).toBe('invited');
    expect(JSON.parse(sess.triggerRationale!).topicMatch).toBe('interview');

    const inv = await prisma.message.findFirst({ where: { scenarioSessionId: sess.id, role: 'invitation' } });
    expect(inv?.text).toContain('Mock Interview');
  });

  it('returns null when an open session already blocks a new offer', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
    for (let i = 0; i < 4; i++) await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: `m${i}` } });
    await prisma.scenarioSession.create({ data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'invited' } });

    const offer = await maybeOfferScenario({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'interview please' });
    expect(offer).toBeNull();
  });
});
