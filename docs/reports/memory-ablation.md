# Memory-Strategy Ablation (W7 Harness)

> Generated deterministically by `npm run report:ablation` from the fixed eval corpus
> (`dataset: expanded-v1`, 64 memories, k=5,
> 4 strategies × 24 probes) using an in-memory
> topic-classifier embedder — **no Ollama required, byte-stable across runs.**

| Strategy | recall@5 |
|---|---|
| recency | 0.083 |
| summary | 0.146 |
| semantic | 1 |
| hybrid | 1 |

**Reading.** The controlled corpus distributes relevant memories across old, middle, and recent
positions and includes unrelated distractors. The recency baseline recovers 0.083 of the
relevant items and the summary strategy 0.146; semantic retrieval reaches 1.
The fixture isolates retrieval-policy behavior rather than claiming real-user effectiveness.

> **Latency and token cost are intentionally omitted above** — the fixture uses a sub-millisecond
> mock embedder, so those numbers are not representative and not deterministic. To capture real
> latency/token cost against a live model, run the dev server (`npm run dev`) with Ollama up and
> call the dev-only eval endpoint:
>
> ```
> curl -s -X POST http://localhost:3100/api/dev/memory-eval \
>   -H 'content-type: application/json' \
>   -b 'pop_uid=<your-user-id>' -d '{"datasetId":"expanded-v1","k":5}' | jq .perStrategy
> ```
>
> The endpoint returns `{ datasetId, k, perStrategy: [{ name, recallAtK, latencyMs, tokenCost }] }`
> and writes one `MemoryRetrievalLog` per (strategy × probe) for the caller.
