// src/server/memory/strategies/hybrid.ts
import type { MemoryStrategy, RecallQuery, RecalledItem, StrategyDeps } from '../types';
import { loadCandidates } from '../candidates';
import { cosineSimilarity } from '../cosine';

export const HYBRID_PARAMETERS = { semanticWeight: 0.7, recencyWeight: 0.3, halfLifeHours: 72 };

export function hybridScore(semantic: number, ageHours: number, params = HYBRID_PARAMETERS): number {
  if (!Number.isFinite(params.halfLifeHours) || params.halfLifeHours <= 0) {
    throw new Error('Hybrid half-life must be finite and positive');
  }
  return params.semanticWeight * semantic
    + params.recencyWeight * Math.pow(0.5, ageHours / params.halfLifeHours);
}

// Proposed method: semantic score fused with a time-decay recency weight (spec §九).
export class HybridStrategy implements MemoryStrategy {
  readonly name = 'hybrid' as const;
  constructor(private deps: StrategyDeps, private now: () => number = Date.now) {}

  async recall(q: RecallQuery): Promise<RecalledItem[]> {
    const all = await loadCandidates(this.deps.prisma, q.userId, q.npcId);
    const embedded = all.filter((c) => c.embedding);
    const now = this.now();

    if (embedded.length === 0) {
      return all
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, q.k)
        .map((c) => ({ id: c.id, kind: c.kind, text: c.text, score: 0 }));
    }

    const qv = await this.deps.ollama.embed(q.queryText);
    return embedded
      .map((c) => {
        const sem = cosineSimilarity(qv, c.embedding as number[]);
        const ageHours = (now - c.createdAt.getTime()) / 3.6e6;
        return { id: c.id, kind: c.kind, text: c.text, score: hybridScore(sem, ageHours) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, q.k);
  }
}
