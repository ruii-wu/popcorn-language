// src/server/memory/candidates.ts
import type { PrismaClient } from '@prisma/client';
import type { Candidate } from './types';
import { factToText, parseEmbedding } from './format';

function isKnownToNpc(raw: string, npcId: string): boolean {
  try {
    const ids = JSON.parse(raw) as unknown;
    return Array.isArray(ids) && (ids.length === 0 || ids.includes(npcId));
  } catch {
    return false;
  }
}

// Loads a user's recallable memory items. Facts are scoped to what the active
// NPC knows; summaries are scoped to the npc's thread when npcId is given.
export async function loadCandidates(
  prisma: PrismaClient,
  userId: string,
  npcId?: string,
): Promise<Candidate[]> {
  const [facts, summaries] = await Promise.all([
    prisma.memoryFact.findMany({ where: { userId } }),
    prisma.conversationSummary.findMany({
      where: { thread: { userId, ...(npcId ? { npcId } : {}) } },
    }),
  ]);
  const out: Candidate[] = [];
  for (const f of facts.filter((fact) => !npcId || isKnownToNpc(fact.knownToNpcs, npcId))) {
    out.push({
      id: f.id,
      kind: 'fact',
      text: factToText(f.predicate, f.value),
      embedding: parseEmbedding(f.embedding),
      createdAt: f.createdAt,
    });
  }
  for (const s of summaries) {
    out.push({
      id: s.id,
      kind: 'summary',
      text: s.summary,
      embedding: parseEmbedding(s.embedding),
      createdAt: s.createdAt,
    });
  }
  return out;
}
