// src/server/scenario/trigger.ts
import type { PrismaClient, ScenarioTemplate } from '@prisma/client';

export const STAGE_VALUE: Record<string, number> = { acquaintance: 1, friend: 2, close: 3 };
export const MIN_USER_TURNS = 3; // user must have warmed up the thread before any offer

export interface TriggerRationale {
  topicMatch: string;
  turnCount: number;
  stage: string;
}

export interface TriggerDeps {
  prisma: PrismaClient;
  userId: string;
  npcId: string;
  threadId: string;
  text: string;
}

// Deterministic B3 trigger: relationship stage + warmed-up thread + topic-keyword match, no open/declined session.
// No LLM — keeps the casual chat turn a single model call and the decision unit-testable.
export async function judgeScenarioTrigger(
  deps: TriggerDeps,
): Promise<{ template: ScenarioTemplate; rationale: TriggerRationale } | null> {
  const { prisma, userId, npcId, threadId, text } = deps;

  const templates = await prisma.scenarioTemplate.findMany({ where: { npcId, enabled: true } });
  if (templates.length === 0) return null;

  const rel = await prisma.relationship.findUnique({ where: { userId_npcId: { userId, npcId } } });
  const stageValue = rel?.stageValue ?? 1;

  // never double-offer: any non-terminal session for this NPC blocks a new offer
  const open = await prisma.scenarioSession.findFirst({
    where: { userId, npcId, status: { in: ['invited', 'accepted', 'active', 'paused'] } },
  });
  if (open) return null;

  const userTurns = await prisma.message.count({ where: { threadId, role: 'user' } });
  if (userTurns < MIN_USER_TURNS) return null;

  const lower = text.toLowerCase();
  for (const t of templates) {
    if (stageValue < (STAGE_VALUE[t.minStage] ?? 99)) continue;
    const declined = await prisma.scenarioSession.findFirst({
      where: { userId, npcId, templateId: t.id, status: 'declined' },
    });
    if (declined) continue; // don't nag after a decline (re-offer tuning deferred)
    let keywords: string[];
    try {
      keywords = JSON.parse(t.topicKeywords) as string[];
    } catch {
      continue; // skip a template with a corrupt topicKeywords value
    }
    const matched = keywords.find((k) => lower.includes(k.toLowerCase()));
    if (!matched) continue;
    return { template: t, rationale: { topicMatch: matched, turnCount: userTurns, stage: rel?.stage ?? 'acquaintance' } };
  }
  return null;
}
