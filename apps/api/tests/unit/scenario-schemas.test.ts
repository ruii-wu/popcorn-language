// tests/unit/scenario-schemas.test.ts
import { describe, it, expect } from 'vitest';
import { ScenarioTurnSchema, ScenarioSummarySchema, MemoryCardSchema } from '@/server/scenario/schemas';

describe('scenario schemas', () => {
  it('parses a valid turn and defaults missing choices to []', () => {
    const t = ScenarioTurnSchema.parse({
      npcReply: 'Tell me about yourself.',
      stateDelta: { impression: 1, stress: 'Medium' },
      isFinalTurn: false,
    });
    expect(t.suggestedChoicesNext).toEqual([]);
    expect(t.stateDelta.stress).toBe('Medium');
  });

  it('rejects a turn with an invalid stress value', () => {
    expect(() =>
      ScenarioTurnSchema.parse({ npcReply: 'x', stateDelta: { impression: 0, stress: 'Panic' }, isFinalTurn: false }),
    ).toThrow();
  });

  it('parses a summary and a memory card', () => {
    expect(ScenarioSummarySchema.parse({ grade: 'B+', languageNote: 'a', pragmaticsNote: 'b', relationshipNote: 'c' }).grade).toBe('B+');
    expect(MemoryCardSchema.parse({ title: 'Polite Disagree-er', body: 'Hedges before pushing back.' }).title).toBe('Polite Disagree-er');
  });

  it('keeps the main summary when auxiliary assessment rows are malformed', () => {
    const parsed = ScenarioSummarySchema.parse({
      grade: 'B', languageNote: 'Clear.', pragmaticsNote: 'Polite.', relationshipNote: 'Warm.',
      skillAssessments: [{ skillCode: 42, score: 'bad' }],
    });
    expect(parsed.grade).toBe('B');
    expect(parsed.skillAssessments).toEqual([{ skillCode: 42, score: 'bad' }]);
  });
});
