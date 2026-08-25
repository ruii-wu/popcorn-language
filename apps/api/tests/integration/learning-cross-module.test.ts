import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runScenarioEnd } from '@/server/scenario/end';
import { recommendScenarios, startScenarioFromTemplate, RecommendationError } from '@/server/learning/recommend';
import { computeLearnerModel } from '@/server/learning/aggregate';
import { writeSignals } from '@/server/learning/signals';

// Cross-module invariants the review specifically called out:
//   (1) A visible completed ScenarioSession blocks re-recommendation of the same template.
//   (2) A scenario_end that writes signals but fails to reach status='completed'
//       does not pollute the learner model on retry (P1 #2 + P1 #4).

const prisma = new PrismaClient();
const U = '__cross_module__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: U } } });
  await prisma.$disconnect();
});

async function freshUser(suffix: string, cefr = 'B1'): Promise<string> {
  const name = U + suffix;
  await prisma.user.deleteMany({ where: { username: name } });
  const user = await prisma.user.create({ data: { username: name, password: 'pw', cefrLevel: cefr } });
  await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2, relationshipPoints: 30 } });
  await prisma.relationship.create({ data: { userId: user.id, npcId: 'emma', stage: 'friend', stageValue: 2, relationshipPoints: 30 } });
  return user.id;
}

describe('cross-module: completion cooldown', () => {
  it('runScenarioEnd → recommender no longer surfaces the same template within 7 days', async () => {
    const userId = await freshUser('_cooldown');
    const thread = await prisma.thread.create({ data: { userId, npcId: 'lily' } });
    const session = await prisma.scenarioSession.create({
      data: { userId, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'active', startedAt: new Date(), state: '{}' },
      include: { template: true, npc: true },
    });
    const ollama = {
      chatJson: vi.fn()
        .mockResolvedValueOnce({ grade: 'A', languageNote: '.', pragmaticsNote: '.', relationshipNote: '.', skillAssessments: [] })
        .mockResolvedValueOnce({ title: 't', body: 'b' }),
      embed: vi.fn(),
    };
    for await (const _e of runScenarioEnd({ prisma, ollama, session, state: { impression: 6, stress: 'Low', turnsLeft: 0, turnIndex: 6 } })) { /* drain */ }

    // The visible completed session is the cooldown source of truth.
    const recs = await recommendScenarios({ prisma, userId, limit: 5 });
    expect(recs.map((r) => r.templateId)).not.toContain('mock_interview');

    // Same check must gate the /start endpoint.
    await expect(
      startScenarioFromTemplate({ prisma, userId, templateId: 'mock_interview' }),
    ).rejects.toBeInstanceOf(RecommendationError);
  });
});

describe('cross-module: end-flow failure does not pollute learner model', () => {
  it('signals from a session that never reached completed are excluded until it does', async () => {
    const userId = await freshUser('_retry');
    const thread = await prisma.thread.create({ data: { userId, npcId: 'lily' } });
    // Simulate a scenario_end that wrote scenario_summary signals and then crashed
    // before flipping status to 'completed'. The session sits in 'active'.
    const session = await prisma.scenarioSession.create({
      data: { userId, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'active' },
    });
    await writeSignals({
      prisma, userId,
      sourceType: 'scenario_summary',
      sourceRef: session.id,
      signals: [{ skillCode: 'pragmatics.hedging', polarity: 'success', score: 0.9, confidence: 0.9, weight: 1, evidence: 'I would say' }],
      scenarioSessionId: session.id,
    });

    // Default learner-model read must ignore the orphan signal.
    let model = await computeLearnerModel({ prisma, userId });
    const hedging = () => model.skills.find((s) => s.skillCode === 'pragmatics.hedging')!;
    expect(hedging().evidenceN).toBe(0);

    // A retry: attempt to write a DIFFERENT assessment for the same session.
    // Immutable-event semantics: the second write is a silent no-op, the first
    // assessment survives.
    await writeSignals({
      prisma, userId,
      sourceType: 'scenario_summary',
      sourceRef: session.id,
      signals: [{ skillCode: 'pragmatics.hedging', polarity: 'mistake', score: 0.1, confidence: 0.9, weight: 1, evidence: 'I say' }],
      scenarioSessionId: session.id,
    });
    const stored = await prisma.learningSignal.findMany({ where: { scenarioSessionId: session.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0].polarity).toBe('success');
    expect(stored[0].score).toBe(0.9);

    // When the retry finally completes the session, the ORIGINAL signal starts counting.
    await prisma.scenarioSession.update({ where: { id: session.id }, data: { status: 'completed' } });
    model = await computeLearnerModel({ prisma, userId });
    expect(hedging().evidenceN).toBe(1);
    expect(hedging().successCount).toBe(1);
  });
});
