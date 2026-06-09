// src/server/memory/strategies/summary.ts
import type { MemoryStrategy, RecallQuery, RecalledItem, StrategyDeps } from '../types';
import { loadCandidates } from '../candidates';

// Compressed baseline: latest conversation summary + all known facts, no semantic ranking (spec §九).
export class SummaryStrategy implements MemoryStrategy {
  readonly name = 'summary' as const;
  constructor(private deps: StrategyDeps) {}

  async recall(q: RecallQuery): Promise<RecalledItem[]> {
    const cands = await loadCandidates(this.deps.prisma, q.userId, q.npcId);
    const facts = cands.filter((c) => c.kind === 'fact');
    const latestSummary = cands
      .filter((c) => c.kind === 'summary')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    const items: RecalledItem[] = facts.map((c) => ({ id: c.id, kind: c.kind, text: c.text, score: 1 }));
    if (latestSummary) {
      items.unshift({ id: latestSummary.id, kind: 'summary', text: latestSummary.text, score: 1 });
    }
    return items;
  }
}
