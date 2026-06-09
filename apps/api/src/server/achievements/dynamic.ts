// src/server/achievements/dynamic.ts
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient, ChatMessage } from '@/server/llm/ollama';
import { buildAchievementContext } from './engine';

const DynamicAchievementSchema = z.object({
  title: z.string().min(1).max(40),
  description: z.string().min(1).max(160),
  icon: z.string().min(1).max(8),
});

export interface DynamicAchievementView {
  id: string;
  title: string;
  description: string;
  icon: string;
}

const SYSTEM_PROMPT =
  'You craft ONE short, fun, personalized achievement for a language learner based on their activity stats and known facts. ' +
  'Return strict JSON {"title": <up to 5 words>, "description": <one encouraging sentence>, "icon": <single emoji>}. ' +
  'Make it specific to their behavior. Do NOT reuse any of the existing titles. No prose outside the JSON.';

// P1 Module 9: mint a personalized, LLM-authored achievement. Persists an owned
// AchievementDef(isDynamic=true) + a UserAchievement (it is immediately earned). Returns the
// new achievement, or null when the LLM fails or the title duplicates one the user already has.
// Never throws — best-effort enrichment, safe to fire after a turn or from a button.
export async function generateDynamicAchievement(
  prisma: PrismaClient,
  ollama: Pick<OllamaClient, 'chatJson'>,
  userId: string,
): Promise<DynamicAchievementView | null> {
  try {
    const ctx = await buildAchievementContext(prisma, userId);
    const facts = await prisma.memoryFact.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 8,
    });
    const existing = await currentTitles(prisma, userId);

    const profile = [
      `messages sent: ${ctx.messageSentCount}`,
      `scenarios completed: ${ctx.completedScenarioCount}`,
      `best scenario grade: ${ctx.bestGrade}`,
      `NPCs at friend+: ${ctx.npcsAtFriendPlus}/${ctx.totalNpcs}`,
      `chat streak (days): ${ctx.streakDays}`,
      `used both zh+en: ${ctx.hasBilingualThread}`,
      `known facts: ${facts.map((f) => `${f.predicate.replace(/_/g, ' ')}: ${f.value}`).join('; ') || 'none'}`,
    ].join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Learner profile:\n${profile}\n\nExisting titles (avoid these): ${existing.join(', ') || 'none'}`,
      },
    ];
    const out = await ollama.chatJson(messages, DynamicAchievementSchema);

    const norm = out.title.trim().toLowerCase();
    if (existing.some((t) => t.trim().toLowerCase() === norm)) return null; // duplicate — skip

    const id = `dyn_${randomUUID()}`;
    await prisma.$transaction([
      prisma.achievementDef.create({
        data: {
          id, title: out.title, description: out.description, icon: out.icon,
          rule: 'dynamic', isDynamic: true, enabled: true,
          ruleConfig: JSON.stringify({ ownerUserId: userId }),
        },
      }),
      prisma.userAchievement.create({ data: { userId, achievementId: id } }),
    ]);
    return { id, title: out.title, description: out.description, icon: out.icon };
  } catch (e) {
    console.error('[achievements] dynamic generation failed', e);
    return null;
  }
}

// Titles the user already has: all static enabled defs + the user's own (dynamic) ones.
async function currentTitles(prisma: PrismaClient, userId: string): Promise<string[]> {
  const [statics, mine] = await Promise.all([
    prisma.achievementDef.findMany({ where: { enabled: true, isDynamic: false }, select: { title: true } }),
    prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: { select: { title: true } } },
    }),
  ]);
  return [...statics.map((s) => s.title), ...mine.map((m) => m.achievement.title)];
}
