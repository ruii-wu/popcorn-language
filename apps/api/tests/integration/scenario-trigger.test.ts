// tests/integration/scenario-trigger.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { judgeScenarioTrigger } from '@/server/scenario/trigger';

const prisma = new PrismaClient();
const U = '__w4_trigger_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

async function freshThread(stage: string, stageValue: number, userTurns: number, npcId = 'lily') {
  await prisma.user.deleteMany({ where: { username: U } });
  const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
  const thread = await prisma.thread.create({ data: { userId: user.id, npcId } });
  await prisma.relationship.create({ data: { userId: user.id, npcId, stage, stageValue } });
  for (let i = 0; i < userTurns; i++) {
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: `m${i}` } });
  }
  return { user, thread };
}

describe('judgeScenarioTrigger', () => {
  it('hits when stage>=minStage, enough turns, and the text matches a topic keyword', async () => {
    const { user, thread } = await freshThread('friend', 2, 4);
    const hit = await judgeScenarioTrigger({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'can we practise a job interview?' });
    expect(hit?.template.id).toBe('mock_interview');
    expect(hit?.rationale.topicMatch).toBe('interview');
  });

  it('misses below the stage threshold for scenarios that require friendship', async () => {
    const { user, thread } = await freshThread('acquaintance', 1, 4, 'emma');
    const hit = await judgeScenarioTrigger({ prisma, userId: user.id, npcId: 'emma', threadId: thread.id, text: 'can we view the apartment?' });
    expect(hit).toBeNull();
  });

  it('allows Lily to offer the interview scenario during the early relationship stage', async () => {
    const { user, thread } = await freshThread('acquaintance', 1, 3);
    const hit = await judgeScenarioTrigger({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'i have an interview tomorrow' });
    expect(hit?.template.id).toBe('mock_interview');
  });

  it('hits when a topic keyword appears earlier in the recent window, not just the current message', async () => {
    // Reproduces the live UAT failure: the user mentions "interview" a turn before they
    // are warmed up, then their warm-up-completing message ("let's mock") has no keyword.
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'hi there' } });
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'i have an interview tomorrow' } });
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: '我们可以来mock一下吗' } });
    const hit = await judgeScenarioTrigger({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: '我们可以来mock一下吗' });
    expect(hit?.template.id).toBe('mock_interview');
    expect(hit?.rationale.topicMatch).toBe('interview');
  });

  it('misses with too few user turns, or no keyword match', async () => {
    const a = await freshThread('friend', 2, 1);
    expect(await judgeScenarioTrigger({ prisma, userId: a.user.id, npcId: 'lily', threadId: a.thread.id, text: 'interview' })).toBeNull();
    const b = await freshThread('friend', 2, 4);
    expect(await judgeScenarioTrigger({ prisma, userId: b.user.id, npcId: 'lily', threadId: b.thread.id, text: 'nice coffee today' })).toBeNull();
  });

  it('does not re-offer while open, but allows a fresh direct topic after decline', async () => {
    const { user, thread } = await freshThread('friend', 2, 4);
    const sess = await prisma.scenarioSession.create({
      data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'invited' },
    });
    expect(await judgeScenarioTrigger({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'interview' })).toBeNull();
    await prisma.scenarioSession.update({ where: { id: sess.id }, data: { hiddenAt: new Date() } });
    expect(await judgeScenarioTrigger({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'interview' })).not.toBeNull();
    await prisma.scenarioSession.update({ where: { id: sess.id }, data: { status: 'declined' } });
    expect(await judgeScenarioTrigger({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'nice coffee today' })).toBeNull();
    expect(await judgeScenarioTrigger({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'can we do another interview?' })).not.toBeNull();
  });

  it('word boundary prevents partial-word matches for English keywords', async () => {
    const { user, thread } = await freshThread('friend', 2, 4);
    // "jobless" contains "job" as substring but should NOT trigger
    expect(await judgeScenarioTrigger({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'feeling jobless lately' })).toBeNull();
    // "rental" contains "rent" as substring but should NOT trigger (emma's flat_viewing keyword)
    const { user: u2, thread: t2 } = await freshThread('friend', 2, 4);
    expect(await judgeScenarioTrigger({ prisma, userId: u2.id, npcId: 'emma', threadId: t2.id, text: 'looking at rental prices' })).toBeNull();
  });

  it('word boundary still matches whole-word keywords at sentence boundaries', async () => {
    const { user, thread } = await freshThread('friend', 2, 4);
    // "job" followed by punctuation should match
    expect(await judgeScenarioTrigger({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'i need a job.' })).not.toBeNull();
    // "job" at end of string should match
    const { user: u2, thread: t2 } = await freshThread('friend', 2, 4);
    expect(await judgeScenarioTrigger({ prisma, userId: u2.id, npcId: 'lily', threadId: t2.id, text: 'looking for a job' })).not.toBeNull();
  });

  it('Chinese keywords still match via includes (no word boundary needed)', async () => {
    const { user, thread } = await freshThread('friend', 2, 4);
    // "面试" is a Chinese topicKeyword in the seed — exercises the CJK includes path
    expect(await judgeScenarioTrigger({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: '我想准备一下面试' })).not.toBeNull();
  });
});
