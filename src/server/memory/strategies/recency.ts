// src/server/memory/strategies/recency.ts
import type { MemoryStrategy, RecallQuery, RecalledItem, StrategyDeps } from '../types';
import { loadCandidates } from '../candidates';

export class RecencyStrategy implements MemoryStrategy {
  readonly name = 'recency' as const;
  constructor(private deps: StrategyDeps) {}

  async recall(q: RecallQuery): Promise<RecalledItem[]> {
    const cands = await loadCandidates(this.deps.prisma, q.userId, q.npcId);
    cands.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return cands.slice(0, q.k).map((c) => ({ id: c.id, kind: c.kind, text: c.text, score: 1 }));
  }
}
