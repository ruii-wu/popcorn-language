import { describe, it, expect } from 'vitest';
import {
  SKILLS,
  CEFR_LEVELS,
  isSkillCode,
  isCefrLevel,
  getSkill,
  initialLevelFromCefr,
} from '@/server/learning/taxonomy';
import { SCENARIO_TEMPLATES } from '../../prisma/seed-data';

describe('learning taxonomy', () => {
  it('has 30 skills across 4 categories', () => {
    expect(SKILLS).toHaveLength(30);
    const byCategory = new Map<string, number>();
    for (const skill of SKILLS) byCategory.set(skill.category, (byCategory.get(skill.category) ?? 0) + 1);
    expect(byCategory.get('grammar')).toBe(10);
    expect(byCategory.get('vocabulary')).toBe(6);
    expect(byCategory.get('pragmatics')).toBe(8);
    expect(byCategory.get('interaction')).toBe(6);
  });

  it('skill codes are unique', () => {
    const codes = new Set(SKILLS.map((s) => s.code));
    expect(codes.size).toBe(SKILLS.length);
  });

  it('every skill code uses category.name format', () => {
    for (const s of SKILLS) expect(s.code.startsWith(s.category + '.')).toBe(true);
  });

  it('all seeded scenario target skills exist in the taxonomy', () => {
    for (const template of SCENARIO_TEMPLATES) {
      for (const code of template.targetSkills) expect(isSkillCode(code)).toBe(true);
    }
  });

  it('isSkillCode rejects unknown codes and non-strings', () => {
    expect(isSkillCode('grammar.past_tense')).toBe(true);
    expect(isSkillCode('grammar.made_up')).toBe(false);
    expect(isSkillCode(null)).toBe(false);
    expect(isSkillCode(42)).toBe(false);
    expect(isSkillCode('')).toBe(false);
  });

  it('getSkill returns null for unknown codes', () => {
    expect(getSkill('grammar.past_tense')?.labelEn).toBe('Past tense');
    expect(getSkill('nope')).toBeNull();
  });

  it('isCefrLevel accepts only the fixed set', () => {
    for (const level of CEFR_LEVELS) expect(isCefrLevel(level)).toBe(true);
    expect(isCefrLevel('A1')).toBe(false);
    expect(isCefrLevel(null)).toBe(false);
    expect(isCefrLevel('B1 ')).toBe(false);
  });

  it('initialLevelFromCefr scales with the gap between user and skill CEFR', () => {
    // user B2 vs skill A2 → gap +2 → 0.75
    expect(initialLevelFromCefr('B2', 'A2')).toBeCloseTo(0.75);
    // exact match → 0.5
    expect(initialLevelFromCefr('B1', 'B1')).toBeCloseTo(0.5);
    // user A2 vs skill C1 → gap -3 → 0.25
    expect(initialLevelFromCefr('A2', 'C1')).toBeCloseTo(0.25);
    // null / unknown → neutral prior
    expect(initialLevelFromCefr(null, 'B1')).toBeCloseTo(0.5);
    expect(initialLevelFromCefr('Z9', 'B1')).toBeCloseTo(0.5);
  });
});
