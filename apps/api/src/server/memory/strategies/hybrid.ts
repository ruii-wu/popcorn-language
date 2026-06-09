// src/server/memory/strategies/hybrid.ts
import type { MemoryStrategy, RecallQuery, RecalledItem, StrategyDeps } from '../types';
import { loadCandidates } from '../candidates';
import { cosineSimilarity } from '../cosine';

const HALF_LIFE_HOURS = 72; // recency weight halves every 3 days
const SEMANTIC_WEIGHT = 0.7;
const RECENCY_WEIGHT = 0.3;

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
        const recency = Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
        return { id: c.id, kind: c.kind, text: c.text, score: SEMANTIC_WEIGHT * sem + RECENCY_WEIGHT * recency };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, q.k);
  }
}
