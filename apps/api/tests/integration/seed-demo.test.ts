// tests/integration/seed-demo.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { seedDemo } from '../../prisma/seedDemo';
import { GET as journeySummary } from '@/app/api/journey/summary/route';
import { SESSION_COOKIE } from '@/server/auth/session';
import { recommendScenarios } from '@/server/learning/recommend';
import { computeLearnerModel } from '@/server/learning/aggregate';

const prisma = new PrismaClient();
const U = '__w9_demo_test__';
const FIXED_NOW = new Date('2026-08-30T12:00:00.000Z');

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('seedDemo', () => {
  it('creates a rich, idempotent demo user the real read paths see as non-empty', async () => {
    // run twice to prove idempotency (no unique-constraint crash, stable counts)
    await seedDemo(prisma, { username: U, now: FIXED_NOW });
    const { userId } = await seedDemo(prisma, { username: U, now: FIXED_NOW });

    const user = await prisma.user.findFirstOrThrow({ where: { username: U }, include: { profile: true, settings: true } });
    expect(user.id).toBe(userId);
    expect(user.cefrLevel).toBe('B1');
    expect(user.profile).not.toBeNull();
    expect(user.settings?.memoryStrategy).toBe('hybrid');

    const rels = await prisma.relationship.findMany({ where: { userId }, orderBy: { stageValue: 'desc' } });
    expect(rels.map((r) => r.stageValue)).toEqual([3, 2, 2]); // close / friend / friend

    expect(await prisma.memoryFact.count({ where: { userId } })).toBeGreaterThanOrEqual(4);
    expect(await prisma.memory.count({ where: { userId } })).toBeGreaterThanOrEqual(1);

    const completed = await prisma.scenarioSession.findFirstOrThrow({ where: { userId, status: 'completed' }, include: { summary: true } });
    expect(completed.summary?.grade).toBeTruthy();
    expect(completed.summary?.preLevels).not.toBe('{}');
    expect(completed.summary?.postLevels).not.toBe('{}');
    expect(await prisma.learningSignal.count({ where: { userId } })).toBeGreaterThanOrEqual(4);

    const visibleMessages = await prisma.message.count({ where: { userId, hiddenAt: null } });
    expect(visibleMessages).toBeGreaterThanOrEqual(12);
    const latestMessage = await prisma.message.findFirstOrThrow({
      where: { userId, hiddenAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(latestMessage.createdAt).toEqual(new Date(FIXED_NOW.getTime() - 2 * 3_600_000));

    const learnerModel = await computeLearnerModel({ prisma, userId });
    expect(learnerModel.focus).toHaveLength(3);
    expect(learnerModel.focus.map((skill) => skill.skillCode)).toEqual(expect.arrayContaining([
      'grammar.past_tense',
      'pragmatics.polite_disagreement',
      'interaction.clarification',
    ]));

    const recommendations = await recommendScenarios({ prisma, userId, limit: 1 });
    expect(recommendations[0]?.templateId).toBe('flat_viewing');
    expect(recommendations[0]?.source).toBe('learner_model');

    expect(await prisma.userAchievement.count({ where: { userId } })).toBeGreaterThanOrEqual(3);
    expect(await prisma.activityEvent.count({ where: { userId } })).toBeGreaterThanOrEqual(6);

    // the real journey endpoint reads it back as non-empty
    const req = new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${userId}` } });
    const body = await (await journeySummary(req)).json();
    expect(body.practiceTurns).toBeGreaterThan(0);
    expect(body.scenarios).toBeGreaterThanOrEqual(1);
    expect(body.memories).toBeGreaterThanOrEqual(1);

    const completion = await prisma.activityEvent.findFirstOrThrow({
      where: { userId, type: 'scenario_completed' },
    });
    expect(JSON.parse(completion.payload)).toMatchObject({
      sessionId: completed.id,
      templateId: 'mock_interview',
      grade: 'A-',
    });
  });
});
