import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { recommendScenarios, startScenarioFromTemplate, dismissRecommendation, RecommendationError } from '@/server/learning/recommend';
import { writeSignals } from '@/server/learning/signals';

const prisma = new PrismaClient();
const U = '__p3_reco_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: U } } });
  await prisma.$disconnect();
});

async function freshUser(suffix = '', cefr: string | null = 'B1'): Promise<string> {
  const name = U + suffix;
  await prisma.user.deleteMany({ where: { username: name } });
  const user = await prisma.user.create({ data: { username: name, password: 'pw', cefrLevel: cefr } });
  await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2, relationshipPoints: 30 } });
  await prisma.relationship.create({ data: { userId: user.id, npcId: 'emma', stage: 'friend', stageValue: 2, relationshipPoints: 30 } });
  return user.id;
}

async function completedSession(userId: string, hidden = false): Promise<string> {
  const thread = await prisma.thread.upsert({
    where: { userId_npcId: { userId, npcId: 'lily' } },
    create: { userId, npcId: 'lily' },
    update: {},
  });
  const session = await prisma.scenarioSession.create({
    data: {
      userId,
      npcId: 'lily',
      threadId: thread.id,
      templateId: 'mock_interview',
      status: 'completed',
      startedAt: new Date(Date.now() - 60_000),
      endedAt: new Date(),
      hiddenAt: hidden ? new Date() : null,
    },
  });
  return session.id;
}

describe('recommendScenarios', () => {
  it('returns a novelty recommendation for a fresh user with no evidence', async () => {
    const userId = await freshUser('_novelty', 'B1');
    const recs = await recommendScenarios({ prisma, userId, limit: 1 });
    expect(recs).toHaveLength(1);
    expect(recs[0].source).toBe('novelty');
    // reason must not claim a weakness that doesn't exist
    expect(recs[0].reason.toLowerCase()).not.toContain('difficulty');
  });

  it('prefers scenarios that target evidenced weaknesses over novel ones', async () => {
    const userId = await freshUser('_weakness', 'B1');
    // Make user weak on hedging + describing_experience (both mock_interview targets)
    for (let i = 0; i < 4; i++) {
      await writeSignals({
        prisma, userId,
        sourceType: 'scenario_summary', sourceRef: `pre_${i}`,
        signals: [{ skillCode: 'pragmatics.hedging', polarity: 'mistake', score: 0.0, confidence: 0.9, weight: 1 }],
      });
    }
    const recs = await recommendScenarios({ prisma, userId, limit: 1 });
    expect(recs).toHaveLength(1);
    expect(recs[0].templateId).toBe('mock_interview');
    expect(recs[0].source).toBe('learner_model');
    expect(recs[0].reason).toContain('Hedging');
  });

  it('does not claim recurring mistakes when weakness evidence contains only successes', async () => {
    const userId = await freshUser('_success_only', 'B1');
    for (let i = 0; i < 3; i++) {
      await writeSignals({
        prisma, userId,
        sourceType: 'scenario_summary', sourceRef: `success_${i}`,
        signals: [{
          skillCode: 'pragmatics.hedging',
          polarity: 'success',
          score: 0.3,
          confidence: 0.9,
          weight: 1,
          evidence: 'I might suggest another approach.',
        }],
      });
    }

    const recs = await recommendScenarios({ prisma, userId, limit: 1 });
    expect(recs[0].templateId).toBe('mock_interview');
    expect(recs[0].source).toBe('learner_model');
    expect(recs[0].reason).toContain('Hedging');
    expect(recs[0].reason).not.toContain('0 recurring mistakes');
  });

  it('filters out templates whose relationship stage is not reached', async () => {
    const userId = await freshUser('_stage', 'B1');
    // Downgrade Emma to acquaintance — flat_viewing needs friend
    await prisma.relationship.update({
      where: { userId_npcId: { userId, npcId: 'emma' } },
      data: { stage: 'acquaintance', stageValue: 1 },
    });
    const recs = await recommendScenarios({ prisma, userId, limit: 5 });
    expect(recs.map((r) => r.templateId)).not.toContain('flat_viewing');
  });

  it('filters out templates with an already-open session', async () => {
    const userId = await freshUser('_open', 'B1');
    const thread = await prisma.thread.create({ data: { userId, npcId: 'lily' } });
    await prisma.scenarioSession.create({
      data: { userId, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'invited' },
    });
    const recs = await recommendScenarios({ prisma, userId, limit: 5 });
    expect(recs.map((r) => r.templateId)).not.toContain('mock_interview');
  });

  it('respects the 3-day dismiss cooldown', async () => {
    const userId = await freshUser('_dismiss', 'B1');
    await prisma.activityEvent.create({
      data: {
        userId,
        type: 'scenario_dismissed',
        payload: JSON.stringify({ templateId: 'mock_interview' }),
      },
    });
    const recs = await recommendScenarios({ prisma, userId, limit: 5 });
    expect(recs.map((r) => r.templateId)).not.toContain('mock_interview');
  });

  it('respects the 7-day completion cooldown', async () => {
    const userId = await freshUser('_complete', 'B1');
    await completedSession(userId);
    const recs = await recommendScenarios({ prisma, userId, limit: 5 });
    expect(recs.map((r) => r.templateId)).not.toContain('mock_interview');
  });

  it('does not apply completion cooldown to a hidden completed session', async () => {
    const userId = await freshUser('_complete_hidden', 'B1');
    await completedSession(userId, true);
    const recs = await recommendScenarios({ prisma, userId, limit: 5 });
    expect(recs.map((r) => r.templateId)).toContain('mock_interview');
  });

  it('filters out too-hard scenarios (>1 CEFR level above user)', async () => {
    // mock_interview is B1, flat_viewing is A2. Set user to A2 → mock_interview is +1 (ok);
    // to test the filter we need a template above userCEFR+1. Simulate by writing user CEFR=A2
    // and bumping mock_interview to C1.
    const userId = await freshUser('_hard', 'A2');
    await prisma.scenarioTemplate.update({
      where: { id: 'mock_interview' },
      data: { difficulty: 'C1' },
    });
    try {
      const recs = await recommendScenarios({ prisma, userId, limit: 5 });
      expect(recs.map((r) => r.templateId)).not.toContain('mock_interview');
    } finally {
      // restore
      await prisma.scenarioTemplate.update({
        where: { id: 'mock_interview' },
        data: { difficulty: 'B1' },
      });
    }
  });

  it('returns empty array when nothing qualifies', async () => {
    const userId = await freshUser('_empty', 'B1');
    await prisma.scenarioTemplate.updateMany({ data: { enabled: false } });
    try {
      const recs = await recommendScenarios({ prisma, userId });
      expect(recs).toEqual([]);
    } finally {
      await prisma.scenarioTemplate.updateMany({ data: { enabled: true } });
    }
  });

  it('is deterministic across identical state', async () => {
    const userId = await freshUser('_deterministic', 'B1');
    const a = await recommendScenarios({ prisma, userId, limit: 1 });
    const b = await recommendScenarios({ prisma, userId, limit: 1 });
    expect(a).toEqual(b);
  });
});

describe('startScenarioFromTemplate', () => {
  it('creates an invited session that the existing invitation flow can accept', async () => {
    const userId = await freshUser('_start', 'B1');
    const result = await startScenarioFromTemplate({ prisma, userId, templateId: 'mock_interview' });
    expect(result.npcId).toBe('lily');
    expect(result.templateId).toBe('mock_interview');
    const session = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: result.sessionId } });
    expect(session.status).toBe('invited');
    expect(session.userId).toBe(userId);
  });

  it('rejects when the stage is not reached', async () => {
    const userId = await freshUser('_start_stage', 'B1');
    await prisma.relationship.update({
      where: { userId_npcId: { userId, npcId: 'emma' } },
      data: { stage: 'acquaintance', stageValue: 1 },
    });
    await expect(
      startScenarioFromTemplate({ prisma, userId, templateId: 'flat_viewing' }),
    ).rejects.toBeInstanceOf(RecommendationError);
  });

  it('rejects when another session is already open with the same NPC', async () => {
    const userId = await freshUser('_start_open', 'B1');
    await startScenarioFromTemplate({ prisma, userId, templateId: 'mock_interview' });
    await expect(
      startScenarioFromTemplate({ prisma, userId, templateId: 'mock_interview' }),
    ).rejects.toBeInstanceOf(RecommendationError);
  });

  it('rejects when the template does not exist', async () => {
    const userId = await freshUser('_start_notfound', 'B1');
    await expect(
      startScenarioFromTemplate({ prisma, userId, templateId: 'made_up_id' }),
    ).rejects.toBeInstanceOf(RecommendationError);
  });

  it('rejects when the scenario was recently dismissed (cooldown parity with recommender)', async () => {
    const userId = await freshUser('_start_dismiss', 'B1');
    await prisma.activityEvent.create({
      data: { userId, type: 'scenario_dismissed', payload: JSON.stringify({ templateId: 'mock_interview' }) },
    });
    await expect(
      startScenarioFromTemplate({ prisma, userId, templateId: 'mock_interview' }),
    ).rejects.toBeInstanceOf(RecommendationError);
  });

  it('rejects when the scenario was recently completed', async () => {
    const userId = await freshUser('_start_completed', 'B1');
    await completedSession(userId);
    await expect(
      startScenarioFromTemplate({ prisma, userId, templateId: 'mock_interview' }),
    ).rejects.toBeInstanceOf(RecommendationError);
  });

  it('rejects when the scenario is more than one CEFR level above the user', async () => {
    const userId = await freshUser('_start_hard', 'A2');
    await prisma.scenarioTemplate.update({ where: { id: 'mock_interview' }, data: { difficulty: 'C1' } });
    try {
      await expect(
        startScenarioFromTemplate({ prisma, userId, templateId: 'mock_interview' }),
      ).rejects.toBeInstanceOf(RecommendationError);
    } finally {
      await prisma.scenarioTemplate.update({ where: { id: 'mock_interview' }, data: { difficulty: 'B1' } });
    }
  });

  it('serializes concurrent starts so only one invited session is created per NPC', async () => {
    const userId = await freshUser('_start_race', 'B1');
    const results = await Promise.allSettled([
      startScenarioFromTemplate({ prisma, userId, templateId: 'mock_interview' }),
      startScenarioFromTemplate({ prisma, userId, templateId: 'mock_interview' }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const open = await prisma.scenarioSession.count({
      where: { userId, npcId: 'lily', status: { in: ['invited', 'accepted', 'active', 'paused'] } },
    });
    expect(open).toBe(1);
  });
});

describe('dismissRecommendation', () => {
  it('writes a scenario_dismissed activity event', async () => {
    const userId = await freshUser('_dismiss_write', 'B1');
    await dismissRecommendation({ prisma, userId, templateId: 'mock_interview' });
    const events = await prisma.activityEvent.findMany({ where: { userId, type: 'scenario_dismissed' } });
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].payload).templateId).toBe('mock_interview');
  });

  it('is idempotent (re-dismiss extends the cooldown window)', async () => {
    const userId = await freshUser('_dismiss_idempotent', 'B1');
    await dismissRecommendation({ prisma, userId, templateId: 'mock_interview' });
    await dismissRecommendation({ prisma, userId, templateId: 'mock_interview' });
    const count = await prisma.activityEvent.count({ where: { userId, type: 'scenario_dismissed' } });
    // both writes succeed — the recommender only looks at the most recent one within cooldown
    expect(count).toBe(2);
  });

  it('rejects unknown template ids', async () => {
    const userId = await freshUser('_dismiss_notfound', 'B1');
    await expect(
      dismissRecommendation({ prisma, userId, templateId: 'ghost' }),
    ).rejects.toBeInstanceOf(RecommendationError);
  });
});
