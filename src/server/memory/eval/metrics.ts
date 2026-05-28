// src/server/memory/eval/metrics.ts

// Rough token estimate: ~1 token per 4 characters of trimmed text (no tokenizer in repo).
// Cited as an approximation in the report — not a model-reported token count.
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

// recall@k = |retrieved ∩ relevant| / |relevant|. Empty relevant set => 1 (nothing to miss).
export function recallAtK(retrievedIds: string[], relevantIds: string[]): number {
  if (relevantIds.length === 0) return 1;
  const retrieved = new Set(retrievedIds);
  const hits = relevantIds.filter((id) => retrieved.has(id)).length;
  return hits / relevantIds.length;
}

export interface StrategyMetricRow {
  name: string;
  recallAtK: number;
  latencyMs: number;
  tokenCost: number;
}

// Markdown comparison table for the Final Report's ablation chapter.
export function toMarkdownTable(rows: StrategyMetricRow[]): string {
  const header = '| Strategy | recall@k | Latency (ms) | Token cost |\n|---|---|---|---|';
  const body = rows
    .map((r) => `| ${r.name} | ${r.recallAtK} | ${r.latencyMs} | ${r.tokenCost} |`)
    .join('\n');
  return `${header}\n${body}`;
}
