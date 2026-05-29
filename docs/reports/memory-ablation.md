# Memory-Strategy Ablation (W7 Harness)

> Generated deterministically by `npm run report:ablation` from the fixed eval corpus
> (`dataset: default`, k=3, 4 strategies × 4 probes) using an in-memory
> topic-classifier embedder — **no Ollama required, byte-stable across runs.**

| Strategy | recall@3 |
|---|---|
| recency | 0.125 |
| summary | 0.375 |
| semantic | 1 |
| hybrid | 1 |

**Reading.** On a corpus where the topical facts sit *outside* the recency window, the recency
baseline recovers only 0.125 of the relevant items, the summary strategy 0.375, while
the semantic and hybrid strategies recover all of them (1). This is the ablation result
cited in the report's memory chapter: embedding-based recall closes the gap that a pure
recency buffer leaves open.

> **Latency and token cost are intentionally omitted above** — the fixture uses a sub-millisecond
> mock embedder, so those numbers are not representative and not deterministic. To capture real
> latency/token cost against a live model, run the dev server (`npm run dev`) with Ollama up and
> call the dev-only eval endpoint:
>
> ```
> curl -s -X POST http://localhost:3100/api/dev/memory-eval \
>   -H 'content-type: application/json' \
>   -b 'pop_uid=<your-user-id>' -d '{"k":3}' | jq .perStrategy
> ```
>
> The endpoint returns `{ datasetId, k, perStrategy: [{ name, recallAtK, latencyMs, tokenCost }] }`
> and writes one `MemoryRetrievalLog` per (strategy × probe) for the caller.
