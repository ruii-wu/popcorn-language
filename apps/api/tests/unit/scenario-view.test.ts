// tests/unit/scenario-view.test.ts
import { describe, it, expect } from 'vitest';
import { mapSessionListItem, mapSessionDetail } from '@/server/scenario/sessionView';

const base = {
  id: 's1', npcId: 'lily', status: 'completed', state: JSON.stringify({ impression: 8, stress: 'Low', turnsLeft: 0, turnIndex: 6 }),
  invitedAt: new Date('2026-05-01'), startedAt: new Date('2026-05-02'), endedAt: new Date('2026-05-03'),
  triggerRationale: JSON.stringify({ topicMatch: 'interview' }),
  template: { id: 'mock_interview', title: 'Mock Interview', titleZh: '模拟面试' },
  summary: { grade: 'A', languageNote: 'Clear.', pragmaticsNote: 'Direct.', relationshipNote: 'Positive.' },
};

describe('scenario view mappers', () => {
  it('maps a list item with title + grade', () => {
    expect(mapSessionListItem(base)).toEqual({
      id: 's1', scenarioTitle: 'Mock Interview', npcId: 'lily', status: 'completed', grade: 'A', startedAt: base.startedAt,
    });
  });

  it('maps a detail with parsed state + transcript', () => {
    const d = mapSessionDetail({ ...base, summary: null }, [
      { id: 'm1', role: 'npc-roleplay', text: 'Why this role?', userId: null, meta: null, createdAt: base.startedAt },
      { id: 'm2', role: 'user', text: 'I value the mission.', userId: 'u1', meta: JSON.stringify({ choiceId: 'c1' }), createdAt: base.endedAt },
    ], JSON.stringify([{ id: 'c2', text: 'Let me explain.', tone: 'Confident', desc: '' }]));
    expect(d.state).toEqual({ impression: 8, stress: 'Low', turnsLeft: 0, turnIndex: 6 });
    expect(d.session.grade).toBeNull();
    expect(d.summary).toBeNull();
    expect(d.transcript).toHaveLength(2);
    expect(d.transcript[0].from).toBe('npc');
    expect(d.transcript[1].meta).toEqual({ choiceId: 'c1' });
    expect(d.choices).toEqual([{ id: 'c2', text: 'Let me explain.', tone: 'Confident', desc: '' }]);
  });

  it('does not expose malformed persisted choices', () => {
    expect(mapSessionDetail({ ...base, summary: null }, [], '{bad').choices).toEqual([]);
  });

  it('returns the persisted completed summary with an empty learningUpdate when no pre/post is stored', () => {
    const detail = mapSessionDetail(base, []);
    expect(detail.summary?.grade).toBe('A');
    expect(detail.summary?.languageNote).toBe('Clear.');
    expect(detail.summary?.learningUpdate).toEqual([]);
    expect(detail.session.grade).toBe('A');
  });

  it('builds learningUpdate items from pre/post levels sorted by |delta|', () => {
    const detail = mapSessionDetail(
      {
        ...base,
        summary: {
          ...base.summary,
          preLevels: JSON.stringify({
            'pragmatics.hedging':   { level: 0.50, evidenceN: 4 },
            'vocabulary.interview': { level: 0.60, evidenceN: 4 },
          }),
          postLevels: JSON.stringify({
            'pragmatics.hedging':   { level: 0.65, evidenceN: 5 },
            'vocabulary.interview': { level: 0.62, evidenceN: 4 },
          }),
        },
      },
      [],
    );
    expect(detail.summary?.learningUpdate).toHaveLength(2);
    // biggest |delta| first
    expect(detail.summary?.learningUpdate?.[0].skillCode).toBe('pragmatics.hedging');
    expect(detail.summary?.learningUpdate?.[0].delta).toBeCloseTo(0.15);
    expect(detail.summary?.learningUpdate?.[0].labelEn).toBe('Hedging');
    expect(detail.summary?.learningUpdate?.[1].skillCode).toBe('vocabulary.interview');
    // evidenceN >= 3 + level in [0.65, 0.80) → solid
    expect(detail.summary?.learningUpdate?.[0].status).toBe('solid');
  });

  it('accepts the legacy raw-number snapshot shape as established evidence', () => {
    const detail = mapSessionDetail(
      {
        ...base,
        summary: {
          ...base.summary,
          preLevels: JSON.stringify({ 'pragmatics.hedging': 0.5 }),
          postLevels: JSON.stringify({ 'pragmatics.hedging': 0.65 }),
        },
      },
      [],
    );
    const item = detail.summary?.learningUpdate?.[0];
    expect(item?.before).toBeCloseTo(0.5);
    expect(item?.after).toBeCloseTo(0.65);
    expect(item?.status).toBe('solid');
  });

  it('drops unknown skill codes from learningUpdate', () => {
    const detail = mapSessionDetail(
      {
        ...base,
        summary: {
          ...base.summary,
          preLevels: JSON.stringify({
            'grammar.made_up':    { level: 0.5, evidenceN: 3 },
            'pragmatics.hedging': { level: 0.5, evidenceN: 3 },
          }),
          postLevels: JSON.stringify({
            'grammar.made_up':    { level: 0.9, evidenceN: 4 },
            'pragmatics.hedging': { level: 0.55, evidenceN: 4 },
          }),
        },
      },
      [],
    );
    const codes = detail.summary?.learningUpdate?.map((u) => u.skillCode) ?? [];
    expect(codes).toEqual(['pragmatics.hedging']);
  });

  it('marks a still-thin skill as gathering even at high level (Summary agrees with Journey)', () => {
    const detail = mapSessionDetail(
      {
        ...base,
        summary: {
          ...base.summary,
          preLevels: JSON.stringify({ 'pragmatics.hedging': { level: 0.5, evidenceN: 0 } }),
          postLevels: JSON.stringify({ 'pragmatics.hedging': { level: 0.90, evidenceN: 1 } }),
        },
      },
      [],
    );
    const item = detail.summary?.learningUpdate?.[0];
    expect(item?.after).toBeCloseTo(0.90);
    // level would say "strong" but evidenceN<3 → gathering (matches aggregate.ts)
    expect(item?.status).toBe('gathering');
  });

  it('handles malformed level JSON gracefully', () => {
    const detail = mapSessionDetail(
      { ...base, summary: { ...base.summary, preLevels: '{bad', postLevels: 'nope' } },
      [],
    );
    expect(detail.summary?.learningUpdate).toEqual([]);
  });
});
