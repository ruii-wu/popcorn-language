// src/server/scenario/trigger.ts
import type { PrismaClient, ScenarioTemplate } from '@prisma/client';

export const STAGE_VALUE: Record<string, number> = { acquaintance: 1, friend: 2, close: 3 };
export const MIN_USER_TURNS = 3; // user must have warmed up the thread before any offer
export const RECENT_WINDOW = 8; // how many recent user messages to scan for a topic keyword

interface KeywordMatcher {
  keyword: string;
  test: (lowerText: string) => boolean;
}

const keywordMatcherCache = new Map<string, KeywordMatcher[]>();
const ASCII_PRINTABLE_RE = /^[\x20-\x7e]+$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordMatchers(rawKeywords: string): KeywordMatcher[] {
  const cached = keywordMatcherCache.get(rawKeywords);
  if (cached) return cached;

  let keywords: string[];
  try {
    keywords = JSON.parse(rawKeywords) as string[];
  } catch {
    keywordMatcherCache.set(rawKeywords, []);
    return [];
  }

  const matchers = keywords
    .filter((k): k is string => typeof k === 'string' && k.length > 0)
    .map((keyword) => {
      const kLower = keyword.toLowerCase();
      if (ASCII_PRINTABLE_RE.test(keyword)) {
        const re = new RegExp(`\\b${escapeRegExp(kLower)}\\b`);
        return { keyword, test: (lowerText: string) => re.test(lowerText) };
      }
      return { keyword, test: (lowerText: string) => lowerText.includes(kLower) };
    });

  keywordMatcherCache.set(rawKeywords, matchers);
  return matchers;
}

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

  // Match topic keywords across the recent user-message window, not just the current
  // message. Users name the topic once — often a turn or two before they've warmed up
  // to MIN_USER_TURNS — and rarely repeat it, so a current-message-only scan misses it.
  // The current message is already persisted by streamChat, but include `text` too so a
  // caller passing an unsaved message still matches.
  const recentUserMsgs = await prisma.message.findMany({
    where: { threadId, role: 'user' },
    orderBy: { createdAt: 'desc' },
    take: RECENT_WINDOW,
    select: { text: true },
  });
  const lower = [text, ...recentUserMsgs.map((m) => m.text)].join('\n').toLowerCase();
  for (const t of templates) {
    if (stageValue < (STAGE_VALUE[t.minStage] ?? 99)) continue;
    const declined = await prisma.scenarioSession.findFirst({
      where: { userId, npcId, templateId: t.id, status: 'declined' },
    });
    if (declined) continue; // don't nag after a decline (re-offer tuning deferred)
    const matched = keywordMatchers(t.topicKeywords).find((matcher) => matcher.test(lower))?.keyword;
    if (!matched) continue;
    return { template: t, rationale: { topicMatch: matched, turnCount: userTurns, stage: rel?.stage ?? 'acquaintance' } };
  }
  return null;
}
