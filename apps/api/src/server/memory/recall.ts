// src/server/memory/recall.ts
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';
import type { RecalledItem } from './types';
import { getMemoryStrategy } from './getStrategy';
import { factToText, isKnownToNpc } from './format';

export interface RecalledForPrompt {
  facts: string[];
  summary?: string;
}

export interface RecallDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'embed'>;
  userId: string;
  npcId?: string;
  queryText: string;
  k?: number;
}

// High-level recall used by the chat pipeline and the NPC panel.
// Reads UserSettings.memoryStrategy (default 'hybrid'); never throws (recall must not break a chat turn).
export async function recallForPrompt(deps: RecallDeps): Promise<RecalledForPrompt> {
  const k = deps.k ?? 6;
  let items: RecalledItem[] = [];
  try {
    const settings = await deps.prisma.userSettings.findUnique({ where: { userId: deps.userId } });
    const strategy = getMemoryStrategy(settings?.memoryStrategy ?? 'hybrid', {
      prisma: deps.prisma,
      ollama: deps.ollama,
    });
    items = await strategy.recall({ userId: deps.userId, npcId: deps.npcId, queryText: deps.queryText, k });
  } catch (e) {
    console.error('[memory] recall failed, continuing with no memory', e);
    items = [];
  }
  return {
    facts: items.filter((i) => i.kind === 'fact').map((i) => i.text),
    summary: items.find((i) => i.kind === 'summary')?.text,
  };
}

// Flat list of a user's known facts for the "What X knows about you" panel.
// When npcId is given, only facts that NPC knows (knownToNpcs ∋ npcId).
export async function listFacts(
  prisma: PrismaClient,
  userId: string,
  limit = 8,
  npcId?: string,
): Promise<string[]> {
  const facts = await prisma.memoryFact.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  const scoped = npcId
    ? facts.filter((f) => isKnownToNpc(f.knownToNpcs, npcId))
    : facts;
  return scoped.slice(0, limit).map((f) => factToText(f.predicate, f.value));
}
