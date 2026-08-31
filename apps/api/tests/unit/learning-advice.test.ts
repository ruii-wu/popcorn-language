import { describe, expect, it } from 'vitest';
import { practiceAdviceFor } from '@/server/learning/advice';
import { SKILLS } from '@/server/learning/taxonomy';

describe('learning practice advice', () => {
  it('provides concrete advice for every skill in the taxonomy', () => {
    for (const skill of SKILLS) {
      expect(practiceAdviceFor(skill.code).length).toBeGreaterThan(30);
    }
  });

  it('gives clarification learners a directly reusable question', () => {
    const advice = practiceAdviceFor('interaction.clarification');
    expect(advice).toContain('Could you clarify');
    expect(advice).toContain('?');
  });
});
