import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  computeLearnerModel,
  STATUS_THRESHOLDS,
  TREND_DELTA_THRESHOLD,
} from '@/server/learning/aggregate';
import { writeSignals } from '@/server/learning/signals';
import { initialLevelFromCefr } from '@/server/learning/taxonomy';

const prisma = new PrismaClient();
const U = '__p2_learner_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: U } } });
  await prisma.$disconnect();
});

async function freshUser(suffix = '', cefr: string | null = null): Promise<string> {
  const name = U + suffix;
  await prisma.user.deleteMany({ where: { username: name } });
  const user = await prisma.user.create({
    data: { username: name, password: 'pw', cefrLevel: cefr },
  });
  return user.id;
}

describe('computeLearnerModel', () => {
  it('returns 30 skills (matches taxonomy)', async () => {
    const userId = await freshUser('_baseline');
    const model = await computeLearnerModel({ prisma, userId });
    expect(model.skills).toHaveLength(30);
  });

  it('bootstraps from CEFR when no signals exist and marks as gathering', async () => {
    const userId = await freshUser('_boot_b2', 'B2');
    const model = await computeLearnerModel({ prisma, userId });
    const pt = model.skills.find((s) => s.skillCode === 'grammar.past_tense')!;
    // gap +2 (B2 vs A2) → 0.75
    expect(pt.level).toBeCloseTo(0.75);
    expect(pt.evidenceN).toBe(0);
    expect(pt.status).toBe('gathering');
  });

  it('uses neutral 0.5 prior when cefrLevel is null', async () => {
    const userId = await freshUser('_boot_null');
    const model = await computeLearnerModel({ prisma, userId });
    const pt = model.skills.find((s) => s.skillCode === 'grammar.past_tense')!;
    expect(pt.level).toBeCloseTo(0.5);
    expect(pt.status).toBe('gathering');
  });

  it('applies EMA with source-specific alpha (correction 0.15, scenario 0.30)', async () => {
    const userId = await freshUser('_ema', 'B1');
    // 3 mistakes on past_tense from correction; each moves level down by α=0.15*0.9*1=0.135
    const initial = initialLevelFromCefr('B1', 'A2'); // 0.65
    let expected = initial;
    for (let i = 0; i < 3; i++) {
      await writeSignals({
        prisma, userId,
        sourceType: 'correction',
        sourceRef: `msg${i}`,
        signals: [{ skillCode: 'grammar.past_tense', polarity: 'mistake', score: 0.0, confidence: 0.9, weight: 1 }],
      });
      const alpha = 0.15 * 0.9 * 1;
      expected = expected * (1 - alpha) + 0.0 * alpha;
    }
    const model = await computeLearnerModel({ prisma, userId });
    const pt = model.skills.find((s) => s.skillCode === 'grammar.past_tense')!;
    expect(pt.level).toBeCloseTo(expected, 3);
    expect(pt.evidenceN).toBe(3);
    expect(pt.mistakeCount).toBe(3);
  });

  it('excludes signals whose sourceMessage was retracted or hidden', async () => {
    const userId = await freshUser('_retract', 'B1');
    const thread = await prisma.thread.create({ data: { userId, npcId: 'lily' } });
    const goodMsg = await prisma.message.create({ data: { threadId: thread.id, userId, role: 'user', text: 'good' } });
    const badMsg = await prisma.message.create({ data: { threadId: thread.id, userId, role: 'user', text: 'bad' } });

    await writeSignals({
      prisma, userId,
      sourceType: 'correction', sourceRef: goodMsg.id,
      signals: [{ skillCode: 'grammar.articles', polarity: 'mistake', score: 0.0, confidence: 0.9, weight: 1 }],
      sourceMessageId: goodMsg.id,
    });
    await writeSignals({
      prisma, userId,
      sourceType: 'correction', sourceRef: badMsg.id,
      signals: [{ skillCode: 'grammar.articles', polarity: 'mistake', score: 0.0, confidence: 0.9, weight: 1 }],
      sourceMessageId: badMsg.id,
    });

    // Retract the second message. Signal must drop out of aggregation.
    await prisma.message.update({ where: { id: badMsg.id }, data: { retractedAt: new Date() } });

    const model = await computeLearnerModel({ prisma, userId });
    const s = model.skills.find((x) => x.skillCode === 'grammar.articles')!;
    expect(s.evidenceN).toBe(1);
  });

  it('excludes signals whose scenarioSession is hidden', async () => {
    const userId = await freshUser('_scenhidden', 'B1');
    const thread = await prisma.thread.create({ data: { userId, npcId: 'lily' } });
    const session = await prisma.scenarioSession.create({
      data: { userId, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'completed' },
    });
    await writeSignals({
      prisma, userId,
      sourceType: 'scenario_summary', sourceRef: session.id,
      signals: [{ skillCode: 'pragmatics.hedging', polarity: 'success', score: 0.8, confidence: 0.9, weight: 1, evidence: 'I would say' }],
      scenarioSessionId: session.id,
    });
    let model = await computeLearnerModel({ prisma, userId });
    expect(model.skills.find((s) => s.skillCode === 'pragmatics.hedging')!.evidenceN).toBe(1);

    await prisma.scenarioSession.update({ where: { id: session.id }, data: { hiddenAt: new Date() } });
    model = await computeLearnerModel({ prisma, userId });
    expect(model.skills.find((s) => s.skillCode === 'pragmatics.hedging')!.evidenceN).toBe(0);
  });

  it('excludes scenario_summary signals from non-completed sessions', async () => {
    const userId = await freshUser('_scenincomplete', 'B1');
    const thread = await prisma.thread.create({ data: { userId, npcId: 'lily' } });
    // Signals persisted from a mid-flow scenario_end that crashed before status='completed'.
    const session = await prisma.scenarioSession.create({
      data: { userId, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'active' },
    });
    await writeSignals({
      prisma, userId,
      sourceType: 'scenario_summary', sourceRef: session.id,
      signals: [{ skillCode: 'pragmatics.hedging', polarity: 'success', score: 0.9, confidence: 0.9, weight: 1, evidence: 'perhaps' }],
      scenarioSessionId: session.id,
    });

    // Default read: incomplete session → signal ignored (no pollution of the learner model)
    let model = await computeLearnerModel({ prisma, userId });
    expect(model.skills.find((s) => s.skillCode === 'pragmatics.hedging')!.evidenceN).toBe(0);

    // Once the session actually completes, the default read starts counting the signal.
    await prisma.scenarioSession.update({ where: { id: session.id }, data: { status: 'completed' } });
    model = await computeLearnerModel({ prisma, userId });
    expect(model.skills.find((s) => s.skillCode === 'pragmatics.hedging')!.evidenceN).toBe(1);
  });

  it('reports trend=improving when recent-3 mean beats prev-3 by more than threshold', async () => {
    const userId = await freshUser('_trend_up', 'B1');
    // 3 mistakes then 3 successes on articles → clear improvement
    const scores = [0, 0, 0, 1, 1, 1];
    const polarities: ('mistake' | 'success')[] = ['mistake','mistake','mistake','success','success','success'];
    for (let i = 0; i < scores.length; i++) {
      await writeSignals({
        prisma, userId,
        sourceType: 'correction', sourceRef: `msg${i}`,
        signals: [{ skillCode: 'grammar.articles', polarity: polarities[i], score: scores[i], confidence: 0.9, weight: 1 }],
      });
    }
    const model = await computeLearnerModel({ prisma, userId });
    const s = model.skills.find((x) => x.skillCode === 'grammar.articles')!;
    expect(s.trend).toBe('improving');
    expect(1.0 - 0.0).toBeGreaterThan(TREND_DELTA_THRESHOLD);   // sanity
  });

  it('reports trend=stable when there are fewer than 6 signals', async () => {
    const userId = await freshUser('_trend_thin', 'B1');
    for (let i = 0; i < 4; i++) {
      await writeSignals({
        prisma, userId,
        sourceType: 'correction', sourceRef: `msg${i}`,
        signals: [{ skillCode: 'grammar.plurals', polarity: 'success', score: 0.9, confidence: 0.9, weight: 1 }],
      });
    }
    const model = await computeLearnerModel({ prisma, userId });
    const s = model.skills.find((x) => x.skillCode === 'grammar.plurals')!;
    expect(s.trend).toBe('stable');
    expect(s.evidenceN).toBe(4);
  });

  it('marks status=needs_practice for weak skills with 3+ evidence', async () => {
    const userId = await freshUser('_needs', 'B1');
    for (let i = 0; i < 5; i++) {
      await writeSignals({
        prisma, userId,
        sourceType: 'scenario_summary', sourceRef: `sess${i}`,
        signals: [{ skillCode: 'pragmatics.polite_disagreement', polarity: 'mistake', score: 0.0, confidence: 0.9, weight: 1 }],
      });
    }
    const model = await computeLearnerModel({ prisma, userId });
    const s = model.skills.find((x) => x.skillCode === 'pragmatics.polite_disagreement')!;
    expect(s.level).toBeLessThan(STATUS_THRESHOLDS.needsPractice);
    expect(s.status).toBe('needs_practice');
  });

  it('focus surfaces up to 3 low-level, evidenced skills; ignores gathering', async () => {
    const userId = await freshUser('_focus', 'B1');
    // Drive 4 skills to low level with 3 evidence each
    const weakSkills = [
      'pragmatics.polite_disagreement',
      'grammar.conditionals',
      'vocabulary.marketing',
      'interaction.narration',
    ];
    for (const code of weakSkills) {
      for (let i = 0; i < 3; i++) {
        await writeSignals({
          prisma, userId,
          sourceType: 'scenario_summary', sourceRef: `${code}_${i}`,
          signals: [{ skillCode: code, polarity: 'mistake', score: 0.0, confidence: 0.9, weight: 1 }],
        });
      }
    }
    // And a "strong" skill w/ 3 evidence — must not be in focus
    for (let i = 0; i < 3; i++) {
      await writeSignals({
        prisma, userId,
        sourceType: 'scenario_summary', sourceRef: `pt_ok_${i}`,
        signals: [{ skillCode: 'grammar.past_tense', polarity: 'success', score: 1.0, confidence: 0.9, weight: 1, evidence: 'went yesterday' }],
      });
    }
    const model = await computeLearnerModel({ prisma, userId });
    expect(model.focus).toHaveLength(3);
    for (const s of model.focus) {
      expect(weakSkills).toContain(s.skillCode);
      expect(s.evidenceN).toBeGreaterThanOrEqual(3);
    }
  });

  it('is scoped by userId', async () => {
    const a = await freshUser('_iso_a', 'B1');
    const b = await freshUser('_iso_b', 'B1');
    await writeSignals({
      prisma, userId: a,
      sourceType: 'correction', sourceRef: 'msg-x',
      signals: [{ skillCode: 'grammar.articles', polarity: 'mistake', score: 0.0, confidence: 0.9, weight: 1 }],
    });
    const modelA = await computeLearnerModel({ prisma, userId: a });
    const modelB = await computeLearnerModel({ prisma, userId: b });
    expect(modelA.skills.find((s) => s.skillCode === 'grammar.articles')!.evidenceN).toBe(1);
    expect(modelB.skills.find((s) => s.skillCode === 'grammar.articles')!.evidenceN).toBe(0);
  });

  it('defensively ignores legacy zero-confidence rows', async () => {
    const userId = await freshUser('_zero_confidence', 'B1');
    await prisma.learningSignal.create({
      data: {
        userId,
        sourceType: 'correction',
        sourceRef: 'legacy-zero-confidence',
        skillCode: 'grammar.articles',
        polarity: 'mistake',
        score: 0,
        confidence: 0,
        weight: 1,
      },
    });
    const model = await computeLearnerModel({ prisma, userId });
    const skill = model.skills.find((item) => item.skillCode === 'grammar.articles')!;
    expect(skill.evidenceN).toBe(0);
    expect(skill.mistakeCount).toBe(0);
  });
});
