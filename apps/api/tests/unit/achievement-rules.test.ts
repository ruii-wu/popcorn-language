import { describe, it, expect } from 'vitest';
import { isUnlocked, gradeAtLeast, type AchievementContext } from '@/server/achievements/rules';

const base: AchievementContext = {
  messageSentCount: 0, completedScenarioCount: 0, bestGrade: '—',
  npcsAtFriendPlus: 0, totalNpcs: 3, hasBilingualThread: false, streakDays: 0,
};

describe('gradeAtLeast', () => {
  it('ranks grades so B+ ≥ B but B- < B', () => {
    expect(gradeAtLeast('A', 'B')).toBe(true);
    expect(gradeAtLeast('B+', 'B')).toBe(true);
    expect(gradeAtLeast('B', 'B')).toBe(true);
    expect(gradeAtLeast('B-', 'B')).toBe(false);
    expect(gradeAtLeast('—', 'B')).toBe(false);
  });
});

describe('isUnlocked', () => {
  it('first_chat needs ≥1 sent message', () => {
    expect(isUnlocked('first_chat', base, {})).toBe(false);
    expect(isUnlocked('first_chat', { ...base, messageSentCount: 1 }, {})).toBe(true);
  });
  it('all_npcs_friend needs every npc at friend+', () => {
    expect(isUnlocked('all_npcs_friend', { ...base, npcsAtFriendPlus: 2 }, {})).toBe(false);
    expect(isUnlocked('all_npcs_friend', { ...base, npcsAtFriendPlus: 3 }, {})).toBe(true);
  });
  it('first_scenario_completed needs ≥1 completed', () => {
    expect(isUnlocked('first_scenario_completed', { ...base, completedScenarioCount: 1 }, {})).toBe(true);
  });
  it('scenario_grade_min honors the configured minGrade and requires a completed scenario', () => {
    expect(isUnlocked('scenario_grade_min', { ...base, bestGrade: 'A' }, { minGrade: 'B' })).toBe(false);
    expect(isUnlocked('scenario_grade_min', { ...base, completedScenarioCount: 1, bestGrade: 'A' }, { minGrade: 'B' })).toBe(true);
    expect(isUnlocked('scenario_grade_min', { ...base, completedScenarioCount: 1, bestGrade: 'C' }, { minGrade: 'B' })).toBe(false);
  });
  it('bilingual_message reads the context flag', () => {
    expect(isUnlocked('bilingual_message', { ...base, hasBilingualThread: true }, {})).toBe(true);
  });
  it('streak_days honors config.days', () => {
    expect(isUnlocked('streak_days', { ...base, streakDays: 6 }, { days: 7 })).toBe(false);
    expect(isUnlocked('streak_days', { ...base, streakDays: 7 }, { days: 7 })).toBe(true);
  });
  it('unknown rule → false', () => {
    expect(isUnlocked('nope', base, {})).toBe(false);
  });
});
