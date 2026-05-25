// src/server/memory/strategies/semantic.ts
import type { MemoryStrategy, RecallQuery, RecalledItem, StrategyDeps } from '../types';
import { loadCandidates } from '../candidates';
import { cosineSimilarity } from '../cosine';

export class SemanticStrategy implements MemoryStrategy {
  readonly name = 'semantic' as const;
  constructor(private deps: StrategyDeps) {}

  async recall(q: RecallQuery): Promise<RecalledItem[]> {
    const cands = (await loadCandidates(this.deps.prisma, q.userId, q.npcId)).filter((c) => c.embedding);
    if (cands.length === 0) return []; // nothing embedded — skip the query embed entirely
    const qv = await this.deps.ollama.embed(q.queryText);
    return cands
      .map((c) => ({ id: c.id, kind: c.kind, text: c.text, score: cosineSimilarity(qv, c.embedding as number[]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, q.k);
  }
}
