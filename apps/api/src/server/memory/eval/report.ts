// src/server/memory/eval/report.ts
import type { MemoryEvalResult } from './harness';
import { getDataset } from './dataset';

// Renders the canonical, deterministic ablation document. Only recall@k is committed (it is
// stable across runs); latency and token cost depend on the in-memory mock embedder and the
// host, so they are obtained from the documented live run rather than committed.
export function renderAblationReport(result: MemoryEvalResult): string {
  const dataset = getDataset(result.datasetId);
  const k = result.k;
  const header = `| Strategy | recall@${k} |\n|---|---|`;
  const rows = result.perStrategy.map((s) => `| ${s.name} | ${s.recallAtK} |`).join('\n');
  const get = (n: string) => result.perStrategy.find((s) => s.name === n);
  const recency = get('recency')?.recallAtK ?? 0;
  const semantic = get('semantic')?.recallAtK ?? 0;
  const summary = get('summary')?.recallAtK ?? 0;

  return `# Memory-Strategy Ablation (W7 Harness)

> Generated deterministically by \`npm run report:ablation\` from the fixed eval corpus
> (\`dataset: ${result.datasetId}\`, ${dataset.corpus.length} memories, k=${k},
> 4 strategies × ${dataset.probes.length} probes) using an in-memory
> topic-classifier embedder — **no Ollama required, byte-stable across runs.**

${header}
${rows}

**Reading.** The controlled corpus distributes relevant memories across old, middle, and recent
positions and includes unrelated distractors. The recency baseline recovers ${recency} of the
relevant items and the summary strategy ${summary}; semantic retrieval reaches ${semantic}.
The fixture isolates retrieval-policy behavior rather than claiming real-user effectiveness.

> **Latency and token cost are intentionally omitted above** — the fixture uses a sub-millisecond
> mock embedder, so those numbers are not representative and not deterministic. To capture real
> latency/token cost against a live model, run the dev server (\`npm run dev\`) with Ollama up and
> call the dev-only eval endpoint:
>
> \`\`\`
> curl -s -X POST http://localhost:3100/api/dev/memory-eval \\
>   -H 'content-type: application/json' \\
>   -b 'pop_uid=<your-user-id>' -d '{"datasetId":"expanded-v1","k":5}' | jq .perStrategy
> \`\`\`
>
> The endpoint returns \`{ datasetId, k, perStrategy: [{ name, recallAtK, latencyMs, tokenCost }] }\`
> and writes one \`MemoryRetrievalLog\` per (strategy × probe) for the caller.
`;
}
