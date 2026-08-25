import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { writeSignals, normalizeSignals, type LearningSignalCandidate } from '@/server/learning/signals';

const prisma = new PrismaClient();
const U = '__p1_signals_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: U } } });
  await prisma.$disconnect();
});

async function freshUser(suffix = ''): Promise<string> {
  const name = U + suffix;
  await prisma.user.deleteMany({ where: { username: name } });
  const user = await prisma.user.create({ data: { username: name, password: 'pw' } });
  return user.id;
}

describe('normalizeSignals', () => {
  it('drops unknown skill codes and non-string codes', () => {
    const raw = [
      { skillCode: 'grammar.past_tense', polarity: 'mistake', score: 0.3, confidence: 0.9, weight: 1 },
      { skillCode: 'not_a_real_code', polarity: 'mistake', score: 0.3, confidence: 0.9, weight: 1 },
      { skillCode: 42, polarity: 'mistake', score: 0.3, confidence: 0.9, weight: 1 },
    ];
    const out = normalizeSignals(raw);
    expect(out.map((s) => s.skillCode)).toEqual(['grammar.past_tense']);
  });

  it('drops items outside the allow-list', () => {
    const raw = [
      { skillCode: 'grammar.past_tense', polarity: 'mistake', score: 0.3, confidence: 0.9, weight: 1 },
      { skillCode: 'pragmatics.hedging', polarity: 'success', score: 0.8, confidence: 0.9, weight: 1 },
    ];
    const out = normalizeSignals(raw, ['pragmatics.hedging']);
    expect(out.map((s) => s.skillCode)).toEqual(['pragmatics.hedging']);
  });

  it('dedupes duplicate skill codes within a single source', () => {
    const raw = [
      { skillCode: 'grammar.past_tense', polarity: 'mistake', score: 0.3, confidence: 0.9, weight: 1 },
      { skillCode: 'grammar.past_tense', polarity: 'success', score: 0.9, confidence: 0.5, weight: 1 },
    ];
    const out = normalizeSignals(raw);
    expect(out).toHaveLength(1);
    expect(out[0].polarity).toBe('mistake'); // first wins
  });

  it('rejects non-array input safely', () => {
    expect(normalizeSignals(null)).toEqual([]);
    expect(normalizeSignals({})).toEqual([]);
    expect(normalizeSignals('nope')).toEqual([]);
  });

  it('drops zero-weight evidence instead of counting a no-op observation', () => {
    expect(normalizeSignals([
      { skillCode: 'grammar.past_tense', polarity: 'mistake', score: 0.2, confidence: 0.9, weight: 0 },
    ])).toEqual([]);
  });

  it('drops zero-confidence evidence instead of counting a no-op observation', () => {
    expect(normalizeSignals([
      { skillCode: 'grammar.past_tense', polarity: 'mistake', score: 0.2, confidence: 0, weight: 1 },
    ])).toEqual([]);
  });
});

describe('writeSignals', () => {
  const signals: LearningSignalCandidate[] = [
    { skillCode: 'grammar.past_tense', polarity: 'mistake', score: 0.3, confidence: 0.9, weight: 1, evidence: 'went yesterday' },
    { skillCode: 'grammar.articles', polarity: 'mistake', score: 0.5, confidence: 0.8, weight: 1 },
  ];

  it('stores signals and is idempotent on repeat calls with same sourceRef (first write wins)', async () => {
    const userId = await freshUser('_idem');
    const n1 = await writeSignals({ prisma, userId, sourceType: 'correction', sourceRef: 'msg1', signals });
    expect(n1).toBe(2);
    // Retry with DIFFERENT values must not overwrite the immutable event.
    const overwrite: LearningSignalCandidate[] = [
      { skillCode: 'grammar.past_tense', polarity: 'success', score: 1.0, confidence: 0.9, weight: 1, evidence: 'REWRITE' },
      { skillCode: 'grammar.articles',   polarity: 'success', score: 1.0, confidence: 0.9, weight: 1 },
    ];
    const n2 = await writeSignals({ prisma, userId, sourceType: 'correction', sourceRef: 'msg1', signals: overwrite });
    expect(n2).toBe(0);
    const count = await prisma.learningSignal.count({ where: { userId } });
    expect(count).toBe(2);
    const stored = await prisma.learningSignal.findMany({ where: { userId, skillCode: 'grammar.past_tense' } });
    expect(stored[0].polarity).toBe('mistake');    // first write survives
    expect(stored[0].score).toBe(0.3);
    expect(stored[0].evidence).toBe('went yesterday');
  });

  it('drops unknown skill codes silently', async () => {
    const userId = await freshUser('_unknown');
    const n = await writeSignals({
      prisma,
      userId,
      sourceType: 'correction',
      sourceRef: 'msg2',
      signals: [
        { skillCode: 'grammar.past_tense', polarity: 'mistake', score: 0.3, confidence: 0.9, weight: 1 },
        { skillCode: 'grammar.time_travel' as never, polarity: 'mistake', score: 0.3, confidence: 0.9, weight: 1 },
      ],
    });
    expect(n).toBe(1);
  });

  it('respects the allowedSkills filter (scenarios only rate declared targets)', async () => {
    const userId = await freshUser('_allow');
    const n = await writeSignals({
      prisma,
      userId,
      sourceType: 'scenario_summary',
      sourceRef: 'ses1',
      signals: [
        { skillCode: 'pragmatics.hedging', polarity: 'success', score: 0.7, confidence: 0.9, weight: 1, evidence: 'I would say' },
        { skillCode: 'grammar.articles', polarity: 'mistake', score: 0.3, confidence: 0.9, weight: 1 },
      ],
      allowedSkills: ['pragmatics.hedging'],
    });
    expect(n).toBe(1);
    const stored = await prisma.learningSignal.findMany({ where: { userId } });
    expect(stored.map((s) => s.skillCode)).toEqual(['pragmatics.hedging']);
  });

  it('requires evidence text for scenario success signals', async () => {
    const userId = await freshUser('_success_evidence');
    const n = await writeSignals({
      prisma,
      userId,
      sourceType: 'scenario_summary',
      sourceRef: 'ses-no-evidence',
      signals: [
        { skillCode: 'pragmatics.hedging', polarity: 'success', score: 0.8, confidence: 0.9, weight: 1 },
      ],
    });
    expect(n).toBe(0);
  });

  it('scopes signals by userId', async () => {
    const a = await freshUser('_a');
    const b = await freshUser('_b');
    await writeSignals({ prisma, userId: a, sourceType: 'correction', sourceRef: 'msg1', signals });
    await writeSignals({ prisma, userId: b, sourceType: 'correction', sourceRef: 'msg1', signals });
    expect(await prisma.learningSignal.count({ where: { userId: a } })).toBe(2);
    expect(await prisma.learningSignal.count({ where: { userId: b } })).toBe(2);
  });

  it('cascade-deletes on Message deletion', async () => {
    const userId = await freshUser('_cascade');
    const thread = await prisma.thread.create({ data: { userId, npcId: 'lily' } });
    const msg = await prisma.message.create({ data: { threadId: thread.id, userId, role: 'user', text: 'hi' } });
    await writeSignals({
      prisma, userId,
      sourceType: 'correction',
      sourceRef: msg.id,
      signals,
      sourceMessageId: msg.id,
    });
    expect(await prisma.learningSignal.count({ where: { userId } })).toBe(2);
    await prisma.message.delete({ where: { id: msg.id } });
    expect(await prisma.learningSignal.count({ where: { userId } })).toBe(0);
  });
});
