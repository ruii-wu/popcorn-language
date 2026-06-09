import type { PrismaClient } from '@prisma/client';
import { computeStreak } from '@/server/users/streak';
import { GRADE_RANK, isUnlocked, type AchievementContext } from './rules';

function safeJson(s: string | null): Record<string, unknown> {
  if (!s) return {};
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
}

export async function buildAchievementContext(prisma: PrismaClient, userId: string): Promise<AchievementContext> {
  const [messageSentCount, completed, npcsAtFriendPlus, totalNpcs, threads, msgEvents] = await Promise.all([
    prisma.activityEvent.count({ where: { userId, type: 'message_sent' } }),
    prisma.scenarioSession.findMany({ where: { userId, status: 'completed' }, include: { summary: true } }),
    prisma.relationship.count({ where: { userId, stageValue: { gte: 2 } } }),
    prisma.npc.count(),
    prisma.thread.findMany({
      where: { userId },
      include: { messages: { where: { role: 'user' }, select: { langDetect: true } } },
    }),
    prisma.activityEvent.findMany({ where: { userId, type: 'message_sent' }, select: { createdAt: true } }),
  ]);

  let bestGrade = '—';
  for (const s of completed) {
    const g = s.summary?.grade ?? '—';
    if ((GRADE_RANK[g] ?? 0) > (GRADE_RANK[bestGrade] ?? 0)) bestGrade = g;
  }

  const hasBilingualThread = threads.some((t) => {
    const langs = new Set(t.messages.map((m) => m.langDetect));
    return langs.has('mixed') || (langs.has('zh') && langs.has('en'));
  });

  const streak = computeStreak(msgEvents.map((e) => e.createdAt));

  return {
    messageSentCount,
    completedScenarioCount: completed.length,
    bestGrade,
    npcsAtFriendPlus,
    totalNpcs,
    hasBilingualThread,
    streakDays: streak.days,
  };
}

// Module 7: evaluate enabled, not-yet-unlocked achievements; persist newly satisfied ones.
// Idempotent (UserAchievement is unique per [userId, achievementId]); never throws — it is a
// best-effort side effect of a chat/scenario turn.
export async function runAchievementTick(prisma: PrismaClient, userId: string): Promise<string[]> {
  try {
    const [defs, unlocked] = await Promise.all([
      prisma.achievementDef.findMany({ where: { enabled: true, isDynamic: false } }),
      prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }),
    ]);
    const have = new Set(unlocked.map((u) => u.achievementId));
    const pending = defs.filter((d) => !have.has(d.id));
    if (pending.length === 0) return [];

    const ctx = await buildAchievementContext(prisma, userId);
    const newly: string[] = [];
    for (const def of pending) {
      if (isUnlocked(def.rule, ctx, safeJson(def.ruleConfig))) {
        await prisma.userAchievement.create({ data: { userId, achievementId: def.id } }).catch(() => {});
        newly.push(def.id);
      }
    }
    return newly;
  } catch (e) {
    console.error('[achievements] tick failed', e);
    return [];
  }
}
