// tests/integration/seed-demo.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { seedDemo } from '../../prisma/seedDemo';
import { GET as journeySummary } from '@/app/api/journey/summary/route';
import { SESSION_COOKIE } from '@/server/auth/session';
import { recommendScenarios } from '@/server/learning/recommend';

const prisma = new PrismaClient();
const U = '__w9_demo_test__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('seedDemo', () => {
  it('creates a rich, idempotent demo user the real read paths see as non-empty', async () => {
    // run twice to prove idempotency (no unique-constraint crash, stable counts)
    await seedDemo(prisma, { username: U });
    const { userId } = await seedDemo(prisma, { username: U });

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

    const recommendations = await recommendScenarios({ prisma, userId, limit: 1 });
    expect(recommendations[0]?.templateId).toBe('flat_viewing');
    expect(recommendations[0]?.source).toBe('learner_model');

    expect(await prisma.userAchievement.count({ where: { userId } })).toBeGreaterThanOrEqual(3);
    expect(await prisma.activityEvent.count({ where: { userId } })).toBeGreaterThanOrEqual(6);

    // the real journey endpoint reads it back as non-empty
    const req = new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${userId}` } });
    const body = await (await journeySummary(req)).json();
    expect(body.conversations).toBeGreaterThan(0);
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
