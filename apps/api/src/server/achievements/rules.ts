// Module 7 (static P0): pure rule evaluators over a precomputed snapshot. The engine builds the
// AchievementContext from the DB; these functions stay pure so they unit-test without a DB.

export const GRADE_RANK: Record<string, number> = {
  'A+': 8, A: 7, 'A-': 6, 'B+': 5, B: 4, 'B-': 3, C: 2, '—': 0,
};

export function gradeAtLeast(grade: string, min: string): boolean {
  return (GRADE_RANK[grade] ?? 0) >= (GRADE_RANK[min] ?? 0);
}

export interface AchievementContext {
  messageSentCount: number;       // total 'message_sent' activity events
  completedScenarioCount: number; // scenarios with status 'completed'
  bestGrade: string;              // highest grade across completed scenarios ('—' if none)
  npcsAtFriendPlus: number;       // distinct npcs at stageValue >= 2
  totalNpcs: number;              // seeded npc count
  hasBilingualThread: boolean;    // some thread mixes zh + en in the user's own messages
  streakDays: number;             // consecutive-day chat streak
}

export type RuleFn = (ctx: AchievementContext, config: Record<string, unknown>) => boolean;

export const RULES: Record<string, RuleFn> = {
  first_chat: (c) => c.messageSentCount >= 1,
  all_npcs_friend: (c) => c.totalNpcs > 0 && c.npcsAtFriendPlus >= c.totalNpcs,
  first_scenario_completed: (c) => c.completedScenarioCount >= 1,
  scenario_grade_min: (c, cfg) => c.completedScenarioCount >= 1 && gradeAtLeast(c.bestGrade, String(cfg.minGrade ?? 'B')),
  bilingual_message: (c) => c.hasBilingualThread,
  streak_days: (c, cfg) => c.streakDays >= Number(cfg.days ?? 7),
};

export function isUnlocked(rule: string, ctx: AchievementContext, config: Record<string, unknown>): boolean {
  const fn = RULES[rule];
  return fn ? fn(ctx, config) : false;
}
