# Backend W7 — Memory-Strategy Eval Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the dev-only memory-strategy ablation harness — `POST /api/dev/memory-eval` runs all four real memory strategies (`recency`/`summary`/`semantic`/`hybrid`) over a fixed, labeled corpus and returns a per-strategy comparison `{ name, recallAtK, latencyMs, tokenCost }`, writing one `MemoryRetrievalLog` row per (strategy × probe) for the caller — so the Final Report can quantify which strategy retrieves the right memories.

**Architecture:** A small `src/server/memory/eval/` module: a pure **dataset** (fixed corpus of labeled facts + one summary, plus probe queries each naming its relevant items), pure **metrics** (`estimateTokens`, `recallAtK`, `toMarkdownTable`), and a **harness** that seeds the corpus under a throwaway eval user (so the caller's real memory is never touched), runs the *unchanged* production strategies via `getMemoryStrategy`, computes metrics, persists `MemoryRetrievalLog` rows attributed to the caller, then deletes the eval user. A thin `POST /api/dev/memory-eval` route gates to non-production, goes through `withUser`, and returns the harness result.

**Tech Stack:** Next.js 14 (App Router, TS), Prisma + SQLite, Zod, Vitest, Ollama HTTP API (`embed`).

---

## Scope

**In scope (this plan):**
- `src/server/memory/eval/metrics.ts` — pure `estimateTokens`, `recallAtK`, `toMarkdownTable` (spec §九 "recall@k / 延迟 / token 成本" + "导出对比表").
- `src/server/memory/eval/dataset.ts` — fixed labeled corpus + probes + registry (`getDataset`).
- `src/server/memory/eval/harness.ts` — `runMemoryEval(...)` orchestrator over the real strategies, writing `MemoryRetrievalLog`.
- `POST /api/dev/memory-eval` (spec §五.10) — dev-only route returning `{ datasetId, k, perStrategy }`.
- Mark W7 done in the master plan; produce the comparison-table artifact.

**Deferred / out of scope (documented decisions — SCOPE GUARD, do not implement):**
- No new Prisma model or migration — `MemoryRetrievalLog` already exists from W1 (schema lines ~298–311). Do **not** alter the schema.
- Do **not** refactor the four strategy classes, `loadCandidates`, `recall.ts`, `getStrategy.ts`, or `cosine.ts`. The harness evaluates them **as-is** (that is the whole point of an ablation). If a strategy looks improvable, that is a *finding for the report*, not a code change in this plan.
- No live wiring into the chat pipeline — this is an offline/dev research surface only.
- 2nd scenario template + P1 angles → **W8**. Suggestion chips → later polish.

**Decisions locked for this plan (so subagents don't re-litigate):**
1. **Throwaway eval user, not the caller's data.** recall@k needs ground-truth labels, so the harness seeds a *fixed* corpus under a fresh `__memeval__<uuid>` user, runs the strategies against it, then deletes that user (cascade clears its facts/thread/summary). The caller's real memory is never read or mutated. **Isolation is the #1 invariant.**
2. **`MemoryRetrievalLog` rows are attributed to the caller** (`userId = callerUserId`), not the throwaway user — so the rows survive eval-user cleanup and form the persistent research record. (`resetUserData` from W6 already deletes a user's `memoryRetrievalLog`, so there is a cleanup path.)
3. **Production-faithful embeddings.** Facts store `embed(value)` and summaries store `embed(summaryText)` — exactly what `factExtract.ts` / `summarize.ts` persist — so the strategies rank using the same vectors they would in production. Candidate *display* text is still derived by `loadCandidates` (`factToText(predicate,value)` for facts, the raw `summary` for summaries).
4. **Uniform top-k for the metric.** recall@k is computed over `items.slice(0, k)` for **every** strategy. `recency`/`semantic`/`hybrid` already slice to `k` internally; `summary` returns its summary + all facts unranked, so the harness slice normalizes it to an apples-to-apples top-k. Logged `retrievedIds` are these top-k ids.
5. **Deterministic seed ordering.** Corpus items are seeded with `createdAt = FIXED_EPOCH + index * 60_000ms` (array order), independent of wall-clock — so `recency` (and the recency term in `hybrid`) is fully reproducible and the "relevant facts are older than filler" property holds by construction.
6. **Dev-only gate.** The route returns **404** when `process.env.NODE_ENV === 'production'` (checked before auth — in prod the endpoint does not exist), otherwise requires `withUser`. Vitest runs with `NODE_ENV !== 'production'`, so the harness runs in tests; a test stubs `NODE_ENV='production'` to assert the 404.
7. **`tokenCost` is a documented heuristic.** No tokenizer is in the repo; `estimateTokens(text) = max(1, ceil(trimmed.length / 4))` — a standard rough English approximation. The report must cite it as an estimate, not a model-reported count.
8. **Response is a superset of the spec example.** Spec shows `{ perStrategy:[...] }`; the harness/route also echo `{ datasetId, k }` (the resolved request inputs) for the report's provenance. This is intentional, not feature creep.

---

## Conventions (match existing code)

- Route file: `export const dynamic = 'force-dynamic';` then `export async function POST(req: Request): Promise<Response>`; business logic wrapped in `withUser(req, async (userId) => { ... })` from `@/server/http/respond` (`json`, `errorJson`, `withUser`).
- DB singleton: `import { prisma } from '@/server/db/client';`. Strategy factory: `import { getMemoryStrategy } from '@/server/memory/getStrategy';`. Ollama: `import { OllamaClient } from '@/server/llm/ollama';`.
- `StrategyName` (`'recency' | 'summary' | 'semantic' | 'hybrid'`) and `StrategyDeps` come from `@/server/memory/types`.
- Tests import the route/service directly and call with a `Request` carrying the session cookie:
  ```ts
  import { SESSION_COOKIE } from '@/server/auth/session';
  const withUid = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });
  ```
- Each integration test owns a unique username sentinel and cleans up in `afterAll` via `prisma.user.deleteMany({ where: { username: U } })` (cascade clears children). `vitest.config.ts` already sets `fileParallelism: false` (SQLite single-writer).
- Commit per task (test + impl together), `git -c core.autocrlf=false commit` (Windows CRLF guard), prefix `feat:` / `test:` / `chore:` / `docs:`.
- Run a single test file: `npm run test -- tests/<path>.test.ts`. Run all: `npm run test`. Typecheck: `npm run typecheck` (or `npx tsc --noEmit`).

## File Structure

| File | Responsibility |
|---|---|
| `src/server/memory/eval/metrics.ts` *(new)* | Pure helpers: `estimateTokens`, `recallAtK`, `toMarkdownTable`. No DB/Ollama. |
| `src/server/memory/eval/dataset.ts` *(new)* | `EvalCorpusItem`, `EvalProbe`, `EvalDataset`, `DATASETS`, `DEFAULT_DATASET_ID`, `getDataset(id?)`. Pure data. |
| `src/server/memory/eval/harness.ts` *(new)* | `PerStrategyResult`, `MemoryEvalResult`, `runMemoryEval(prisma, ollama, callerUserId, opts)`. Seeds eval user, runs strategies, logs, cleans up. |
| `src/app/api/dev/memory-eval/route.ts` *(new)* | `POST` — dev-only gate → `withUser` → Zod `{ datasetId?, k? }` → `runMemoryEval` → `{ datasetId, k, perStrategy }`. |
| `docs/superpowers/plans/2026-05-25-backend-overall-plan.md` *(modify)* | mark W7 row DONE. |

---

## Task 1: Eval metrics (`estimateTokens` / `recallAtK` / `toMarkdownTable`)

**Files:**
- Create: `src/server/memory/eval/metrics.ts`
- Test: `tests/unit/memory-eval-metrics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/memory-eval-metrics.test.ts
import { describe, it, expect } from 'vitest';
import { estimateTokens, recallAtK, toMarkdownTable } from '@/server/memory/eval/metrics';

describe('estimateTokens', () => {
  it('approximates ~1 token per 4 chars, with a floor of 1', () => {
    expect(estimateTokens('')).toBe(1);
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('12345678')).toBe(2); // 8/4
    expect(estimateTokens('  abcd  ')).toBe(1); // trimmed to 4 chars
  });
});

describe('recallAtK', () => {
  it('is the fraction of relevant ids present in the retrieved list', () => {
    expect(recallAtK(['a', 'b', 'c'], ['a', 'b'])).toBe(1);
    expect(recallAtK(['a', 'x', 'y'], ['a', 'b'])).toBe(0.5);
    expect(recallAtK(['x', 'y'], ['a', 'b'])).toBe(0);
  });

  it('does not double-count and ignores retrieved ids that are not relevant', () => {
    expect(recallAtK(['a', 'a', 'z'], ['a', 'b'])).toBe(0.5);
  });

  it('returns 1 when there are no relevant ids (nothing to miss)', () => {
    expect(recallAtK(['a'], [])).toBe(1);
  });
});

describe('toMarkdownTable', () => {
  it('renders a strategy comparison table', () => {
    const md = toMarkdownTable([
      { name: 'recency', recallAtK: 0.125, latencyMs: 2, tokenCost: 18 },
      { name: 'semantic', recallAtK: 1, latencyMs: 5, tokenCost: 20 },
    ]);
    expect(md).toContain('| Strategy | recall@k | Latency (ms) | Token cost |');
    expect(md).toContain('| recency | 0.125 | 2 | 18 |');
    expect(md).toContain('| semantic | 1 | 5 | 20 |');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/memory-eval-metrics.test.ts`
Expected: FAIL — cannot import from `@/server/memory/eval/metrics`.

- [ ] **Step 3: Implement the metrics**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/memory-eval-metrics.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/memory/eval/metrics.ts tests/unit/memory-eval-metrics.test.ts
git -c core.autocrlf=false commit -m "feat: memory-eval metrics (estimateTokens/recallAtK/toMarkdownTable)"
```

---

## Task 2: Eval dataset (fixed labeled corpus + probes)

**Files:**
- Create: `src/server/memory/eval/dataset.ts`
- Test: `tests/unit/memory-eval-dataset.test.ts`

The corpus is ordered facts (older→newer by array index) followed by one summary (newest), so the `recency` baseline — which favors newest items — misses the older topical facts, while `semantic`/`hybrid` find them. Probe `relevantKeys` reference corpus `key`s.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/memory-eval-dataset.test.ts
import { describe, it, expect } from 'vitest';
import { getDataset, DATASETS, DEFAULT_DATASET_ID } from '@/server/memory/eval/dataset';

describe('eval dataset', () => {
  it('getDataset returns the default dataset when id is omitted or unknown', () => {
    expect(getDataset().id).toBe(DEFAULT_DATASET_ID);
    expect(getDataset('nope').id).toBe(DEFAULT_DATASET_ID);
    expect(getDataset(DEFAULT_DATASET_ID).id).toBe(DEFAULT_DATASET_ID);
  });

  it('every dataset has unique corpus keys and probes that only reference existing keys', () => {
    for (const ds of Object.values(DATASETS)) {
      const keys = ds.corpus.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length); // unique keys
      expect(ds.probes.length).toBeGreaterThan(0);
      for (const probe of ds.probes) {
        expect(probe.relevantKeys.length).toBeGreaterThan(0);
        for (const rk of probe.relevantKeys) {
          expect(keys).toContain(rk);
        }
      }
    }
  });

  it('the default dataset has a defaultK and both fact and summary corpus items', () => {
    const ds = getDataset();
    expect(ds.defaultK).toBeGreaterThan(0);
    expect(ds.corpus.some((c) => c.kind === 'fact')).toBe(true);
    expect(ds.corpus.some((c) => c.kind === 'summary')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/memory-eval-dataset.test.ts`
Expected: FAIL — cannot import from `@/server/memory/eval/dataset`.

- [ ] **Step 3: Implement the dataset**

```ts
// src/server/memory/eval/dataset.ts

// A labeled corpus item. Facts carry predicate+value (the harness embeds `value`, matching
// factExtract.ts); summaries carry `summary` text (the harness embeds the summary text).
export type EvalCorpusItem =
  | { key: string; kind: 'fact'; predicate: string; value: string }
  | { key: string; kind: 'summary'; summary: string };

// A probe query and the set of corpus keys that *should* be recalled for it.
export interface EvalProbe {
  queryText: string;
  relevantKeys: string[];
}

export interface EvalDataset {
  id: string;
  defaultK: number;
  // Ordered oldest -> newest; the harness seeds createdAt by index.
  corpus: EvalCorpusItem[];
  probes: EvalProbe[];
}

// Default ablation set: four topical facts (oldest) + four filler facts + one summary (newest).
// Designed so the topical facts sit *outside* the recency window, exposing the recall gap
// between the recency baseline and the semantic/hybrid strategies.
const DEFAULT: EvalDataset = {
  id: 'default',
  defaultK: 3,
  corpus: [
    { key: 'pet', kind: 'fact', predicate: 'has_pet', value: 'cat' },
    { key: 'job', kind: 'fact', predicate: 'works_as', value: 'software engineer' },
    { key: 'hobby', kind: 'fact', predicate: 'likes', value: 'hiking' },
    { key: 'food', kind: 'fact', predicate: 'dislikes', value: 'spicy food' },
    { key: 'filler1', kind: 'fact', predicate: 'lives_near', value: 'Clementi' },
    { key: 'filler2', kind: 'fact', predicate: 'studies_for', value: 'IELTS exam' },
    { key: 'filler3', kind: 'fact', predicate: 'goal', value: 'move to Canada' },
    { key: 'filler4', kind: 'fact', predicate: 'has_sibling', value: 'younger brother' },
    { key: 'sum', kind: 'summary', summary: 'User discussed weekend hiking plans and their cat.' },
  ],
  probes: [
    { queryText: 'Tell me about your pet', relevantKeys: ['pet'] },
    { queryText: 'What do you do for work?', relevantKeys: ['job'] },
    { queryText: 'Any weekend outdoor plans?', relevantKeys: ['hobby', 'sum'] },
    { queryText: 'How do you feel about spicy dishes?', relevantKeys: ['food'] },
  ],
};

export const DATASETS: Record<string, EvalDataset> = { [DEFAULT.id]: DEFAULT };
export const DEFAULT_DATASET_ID = DEFAULT.id;

// Resolve a dataset by id, falling back to the default for unknown/omitted ids.
export function getDataset(id?: string): EvalDataset {
  return (id && DATASETS[id]) || DATASETS[DEFAULT_DATASET_ID];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/memory-eval-dataset.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/memory/eval/dataset.ts tests/unit/memory-eval-dataset.test.ts
git -c core.autocrlf=false commit -m "feat: memory-eval fixed labeled dataset"
```

---

## Task 3: Eval harness (`runMemoryEval`)

**Files:**
- Create: `src/server/memory/eval/harness.ts`
- Test: `tests/integration/memory-eval-harness.test.ts`

The harness seeds the corpus under a throwaway eval user (facts + one thread/summary, with production-faithful embeddings and deterministic `createdAt`), runs each of the four strategies via `getMemoryStrategy`, computes per-probe recall@k / latency / tokenCost, writes one `MemoryRetrievalLog` per (strategy × probe) **for the caller**, aggregates per strategy, and finally deletes the eval user in a `finally`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/memory-eval-harness.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runMemoryEval } from '@/server/memory/eval/harness';

const prisma = new PrismaClient();
const CALLER = '__w7_harness_caller__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { in: [CALLER] } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: '__memeval__' } } });
  await prisma.$disconnect();
});

// Deterministic topic-classifier embedding: each text maps to one orthogonal basis vector,
// so cosine cleanly ranks the topically-matching corpus item first. Priority order matters
// (the summary text mentions both "hiking" and "cat" — hiking wins).
const E = {
  hobby: [1, 0, 0, 0, 0],
  pet: [0, 1, 0, 0, 0],
  job: [0, 0, 1, 0, 0],
  food: [0, 0, 0, 1, 0],
  other: [0, 0, 0, 0, 1],
};
const TOPICS: { vec: number[]; words: string[] }[] = [
  { vec: E.hobby, words: ['hiking', 'outdoor', 'weekend'] },
  { vec: E.pet, words: ['pet', 'cat'] },
  { vec: E.job, words: ['work', 'job', 'engineer'] },
  { vec: E.food, words: ['spicy', 'food', 'dish'] },
];
const ollamaMock = {
  embed: async (text: string): Promise<number[]> => {
    const t = text.toLowerCase();
    for (const top of TOPICS) if (top.words.some((w) => t.includes(w))) return top.vec;
    return E.other;
  },
};

describe('runMemoryEval', () => {
  it('compares all four strategies, logs per probe for the caller, and cleans up the eval user', async () => {
    const caller = await prisma.user.create({ data: { username: CALLER, password: 'pw' } });

    const result = await runMemoryEval(prisma, ollamaMock, caller.id, { k: 3 });

    expect(result.datasetId).toBe('default');
    expect(result.k).toBe(3);
    expect(result.perStrategy.map((s) => s.name).sort()).toEqual(
      ['hybrid', 'recency', 'semantic', 'summary'],
    );

    for (const s of result.perStrategy) {
      expect(s.recallAtK).toBeGreaterThanOrEqual(0);
      expect(s.recallAtK).toBeLessThanOrEqual(1);
      expect(s.latencyMs).toBeGreaterThanOrEqual(0);
      expect(s.tokenCost).toBeGreaterThanOrEqual(0);
    }

    const get = (n: string) => result.perStrategy.find((s) => s.name === n)!;
    // The research hypothesis holds on the fixture: semantic recovers the older topical facts
    // that the recency baseline misses.
    expect(get('semantic').recallAtK).toBeGreaterThan(get('recency').recallAtK);
    expect(get('semantic').recallAtK).toBe(1);

    // One MemoryRetrievalLog row per (strategy × probe), attributed to the caller.
    const logCount = await prisma.memoryRetrievalLog.count({ where: { userId: caller.id } });
    expect(logCount).toBe(4 * 4); // 4 strategies × 4 probes
    const oneLog = await prisma.memoryRetrievalLog.findFirst({ where: { userId: caller.id } });
    expect(oneLog?.k).toBe(3);

    // The throwaway eval user is gone; no orphan memeval users remain.
    expect(await prisma.user.count({ where: { username: { startsWith: '__memeval__' } } })).toBe(0);
    // The caller owns no facts/threads (its data was never touched — only logs were written).
    expect(await prisma.memoryFact.count({ where: { userId: caller.id } })).toBe(0);
    expect(await prisma.thread.count({ where: { userId: caller.id } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/memory-eval-harness.test.ts`
Expected: FAIL — cannot import `runMemoryEval`.

- [ ] **Step 3: Implement the harness**

```ts
// src/server/memory/eval/harness.ts
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';
import type { StrategyName } from '@/server/memory/types';
import { getMemoryStrategy } from '@/server/memory/getStrategy';
import { getDataset } from './dataset';
import { estimateTokens, recallAtK } from './metrics';

const ALL_STRATEGIES: StrategyName[] = ['recency', 'summary', 'semantic', 'hybrid'];
const SEED_EPOCH = Date.parse('2025-01-01T00:00:00.000Z');
const SEED_NPC_ID = 'lily'; // a seeded NPC (FK target for the eval user's thread)

export interface PerStrategyResult {
  name: StrategyName;
  recallAtK: number;
  latencyMs: number;
  tokenCost: number;
}

export interface MemoryEvalResult {
  datasetId: string;
  k: number;
  perStrategy: PerStrategyResult[];
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Runs the four memory strategies over a fixed labeled corpus and returns a per-strategy
// recall@k / latency / token-cost comparison. Seeds a throwaway eval user (so the caller's
// real memory is never touched), writes one MemoryRetrievalLog per (strategy × probe) for the
// caller, and deletes the eval user on the way out. ollama only needs `embed`.
export async function runMemoryEval(
  prisma: PrismaClient,
  ollama: Pick<OllamaClient, 'embed'>,
  callerUserId: string,
  opts: { datasetId?: string; k?: number } = {},
): Promise<MemoryEvalResult> {
  const dataset = getDataset(opts.datasetId);
  const k = opts.k ?? dataset.defaultK;

  const evalUser = await prisma.user.create({
    data: { username: `__memeval__${randomUUID()}`, password: 'x' },
  });

  try {
    // Seed the corpus with production-faithful embeddings and deterministic createdAt.
    const keyToId = new Map<string, string>();
    let thread: { id: string } | null = null;

    for (let i = 0; i < dataset.corpus.length; i++) {
      const item = dataset.corpus[i];
      const createdAt = new Date(SEED_EPOCH + i * 60_000);
      if (item.kind === 'fact') {
        const embedding = JSON.stringify(await ollama.embed(item.value)); // matches factExtract.ts
        const row = await prisma.memoryFact.create({
          data: {
            userId: evalUser.id,
            predicate: item.predicate,
            value: item.value,
            embedding,
            createdAt,
          },
        });
        keyToId.set(item.key, row.id);
      } else {
        if (!thread) {
          thread = await prisma.thread.create({ data: { userId: evalUser.id, npcId: SEED_NPC_ID } });
        }
        const embedding = JSON.stringify(await ollama.embed(item.summary));
        const row = await prisma.conversationSummary.create({
          data: {
            threadId: thread.id,
            fromMsgId: 'eval',
            toMsgId: 'eval',
            summary: item.summary,
            embedding,
            createdAt,
          },
        });
        keyToId.set(item.key, row.id);
      }
    }

    const perStrategy: PerStrategyResult[] = [];

    for (const name of ALL_STRATEGIES) {
      const strategy = getMemoryStrategy(name, { prisma, ollama });
      let recallSum = 0;
      let latencySum = 0;
      let tokenSum = 0;

      for (const probe of dataset.probes) {
        const started = Date.now();
        const items = await strategy.recall({ userId: evalUser.id, queryText: probe.queryText, k });
        const latencyMs = Date.now() - started;

        const topk = items.slice(0, k);
        const topkIds = topk.map((it) => it.id);
        const relevantIds = probe.relevantKeys
          .map((key) => keyToId.get(key))
          .filter((id): id is string => Boolean(id));
        const recall = recallAtK(topkIds, relevantIds);
        const tokenCost = topk.reduce((sum, it) => sum + estimateTokens(it.text), 0);

        recallSum += recall;
        latencySum += latencyMs;
        tokenSum += tokenCost;

        await prisma.memoryRetrievalLog.create({
          data: {
            userId: callerUserId,
            strategy: name,
            queryText: probe.queryText,
            retrievedIds: JSON.stringify(topkIds),
            k,
            latencyMs,
            tokenCost,
          },
        });
      }

      const n = dataset.probes.length;
      perStrategy.push({
        name,
        recallAtK: round3(recallSum / n),
        latencyMs: Math.round(latencySum / n),
        tokenCost: Math.round(tokenSum / n),
      });
    }

    return { datasetId: dataset.id, k, perStrategy };
  } finally {
    // Cascade clears the eval user's facts, thread, and summary. Caller-owned logs survive.
    await prisma.user.delete({ where: { id: evalUser.id } }).catch(() => {});
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/memory-eval-harness.test.ts`
Expected: PASS (1 test). The fixture yields `recency ≈ 0.125`, `summary ≈ 0.625`, `semantic = 1`, `hybrid = 1`.

- [ ] **Step 5: Commit**

```bash
git add src/server/memory/eval/harness.ts tests/integration/memory-eval-harness.test.ts
git -c core.autocrlf=false commit -m "feat: runMemoryEval harness (ablation over the real strategies)"
```

---

## Task 4: `POST /api/dev/memory-eval`

**Files:**
- Create: `src/app/api/dev/memory-eval/route.ts`
- Test: `tests/integration/memory-eval-route.test.ts`

The route gates to non-production (404 in prod, before auth), then `withUser`, parses `{ datasetId?, k? }`, and runs the harness with a real `OllamaClient`. The route test stubs global `fetch` so the real `OllamaClient.embed` resolves to a fixed vector — the route test asserts *shape + logging + gating*; the deep ranking behavior is already covered by the harness test (Task 3).

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/memory-eval-route.test.ts
import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST } from '@/app/api/dev/memory-eval/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w7_memeval_route__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.user.deleteMany({ where: { username: { startsWith: '__memeval__' } } });
  await prisma.$disconnect();
});
afterEach(() => vi.unstubAllGlobals());

const post = (uid: string, body: unknown) =>
  new Request('http://x/', {
    method: 'POST',
    headers: { cookie: `${SESSION_COOKIE}=${uid}` },
    body: JSON.stringify(body),
  });

// Stub global fetch so the route's real OllamaClient.embed returns a fixed vector.
function stubEmbedFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/api/embeddings')) {
        return new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }), { status: 200 });
      }
      throw new Error(`unexpected ${u}`);
    }),
  );
}

describe('POST /api/dev/memory-eval', () => {
  it('401s without a cookie (in dev)', async () => {
    const res = await POST(new Request('http://x/', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });

  it('404s in production (the endpoint does not exist in prod), even with a cookie', async () => {
    const prev = process.env.NODE_ENV;
    // @ts-expect-error -- override readonly NODE_ENV for the test
    process.env.NODE_ENV = 'production';
    try {
      const res = await POST(post('whoever', {}));
      expect(res.status).toBe(404);
    } finally {
      // @ts-expect-error -- restore
      process.env.NODE_ENV = prev;
    }
  });

  it('returns a four-strategy comparison and writes retrieval logs for the caller', async () => {
    stubEmbedFetch();
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });

    const res = await POST(post(user.id, { k: 3 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.datasetId).toBe('default');
    expect(body.k).toBe(3);
    expect(body.perStrategy).toHaveLength(4);
    for (const s of body.perStrategy) {
      expect(typeof s.name).toBe('string');
      expect(s.recallAtK).toBeGreaterThanOrEqual(0);
      expect(s.recallAtK).toBeLessThanOrEqual(1);
    }
    expect(await prisma.memoryRetrievalLog.count({ where: { userId: user.id } })).toBe(16);
  });

  it('400s on an invalid k', async () => {
    stubEmbedFetch();
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const res = await POST(post(user.id, { k: -5 }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/memory-eval-route.test.ts`
Expected: FAIL — cannot import `POST` from a non-existent route.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/dev/memory-eval/route.ts
import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { OllamaClient } from '@/server/llm/ollama';
import { withUser, json, errorJson } from '@/server/http/respond';
import { runMemoryEval } from '@/server/memory/eval/harness';

export const dynamic = 'force-dynamic';

const Body = z.object({
  datasetId: z.string().optional(),
  k: z.number().int().positive().max(20).optional(),
});

export async function POST(req: Request): Promise<Response> {
  // Dev-only research surface — the endpoint does not exist in production.
  if (process.env.NODE_ENV === 'production') {
    return errorJson(404, 'NOT_FOUND', 'not found');
  }
  return withUser(req, async (userId) => {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'invalid memory-eval payload');
    const result = await runMemoryEval(prisma, new OllamaClient(), userId, parsed.data);
    return json(result);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/memory-eval-route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/dev/memory-eval/route.ts tests/integration/memory-eval-route.test.ts
git -c core.autocrlf=false commit -m "feat: POST /api/dev/memory-eval (dev-only ablation route)"
```

---

## Task 5: Whole-suite verification + mark W7 done + produce the comparison artifact

**Files:**
- Modify: `docs/superpowers/plans/2026-05-25-backend-overall-plan.md` (W7 row)

- [ ] **Step 1: Run the full test suite + typecheck**

Run: `npm run test`
Expected: ALL tests pass (194 prior + the new W7 tests: 5 metrics + 3 dataset + 1 harness + 4 route = 13 new). `fileParallelism:false` is already set.

Run: `npm run typecheck` (or `npx tsc --noEmit`)
Expected: exit 0, no errors.

If anything fails, STOP and fix before continuing — do not mark W7 done with a red suite.

- [ ] **Step 2: Update the master plan W7 row**

In `docs/superpowers/plans/2026-05-25-backend-overall-plan.md`, change the `**W7**` row in the §3 phase table. Set the first cell to `**W7** ✅`, set the plan-file cell to `` `2026-05-29-backend-w7-memory-eval.md` ``, and replace the `Done when` cell with:

```
**DONE** — Memory-strategy ablation harness: `POST /api/dev/memory-eval` (dev-only, 404 in prod) runs all four real strategies over a fixed labeled corpus and returns `{ datasetId, k, perStrategy:[{name,recallAtK,latencyMs,tokenCost}] }`, writing one `MemoryRetrievalLog` per (strategy × probe) for the caller. Pure `metrics.ts` (recall@k / estimateTokens / markdown table) + fixed `dataset.ts` (labeled facts + summary + probes) + `harness.ts` (seeds a throwaway `__memeval__` user with production-faithful embeddings, runs strategies via `getMemoryStrategy`, cleans up — caller data never touched). Fixture demonstrates the ablation (recency ≈ 0.125 < summary ≈ 0.625 < semantic = hybrid = 1.0). All tests pass, typecheck clean. **Deferred:** 2nd scenario template + P1 → W8.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-05-25-backend-overall-plan.md
git -c core.autocrlf=false commit -m "docs: mark W7 done in master plan"
```

- [ ] **Step 4: (Controller, optional — needs live Ollama) Produce the report artifact**

This is a *controller* step performed after the branch is green and reviewed — not a subagent task. If Ollama is running locally (`qwen2.5:7b-instruct` + `nomic-embed-text` installed), call the live endpoint to capture the real ablation table for the Final Report:

```bash
# with the dev server running (npm run dev -- -p 3100) and an authenticated cookie:
curl -s -X POST http://localhost:3100/api/dev/memory-eval -H 'content-type: application/json' \
  -b 'pop_uid=<a real userId>' -d '{"k":3}'
```

Feed the returned `perStrategy` through `toMarkdownTable` (from `metrics.ts`) to render the comparison table for the report. If Ollama is **not** running, this step is skipped — the deterministic Vitest suite (Tasks 1–4) is the hard gate; the live table is a reporting nicety, not a merge blocker.

---

## Self-Review (completed against spec §五.10 + §九)

**Spec coverage:**
- §五.10 `POST /api/dev/memory-eval` `{ datasetId?, k? }` → `{ perStrategy:[{name,recallAtK,latencyMs,tokenCost}] }`: Task 4 (route) over Task 3 (harness). Response is a documented superset (`{ datasetId, k, perStrategy }`). ✓
- §九 "固定 transcript + 标注'应召回事实'集合，对每个策略算 recall@k / 延迟 / token 成本，写 MemoryRetrievalLog": fixed labeled corpus (Task 2), all four strategies run via `getMemoryStrategy` (Task 3), recall@k / latencyMs / tokenCost computed + logged per (strategy × probe) (Task 3). ✓
- §九 "导出对比表 → Final Report 消融章节": `toMarkdownTable` (Task 1) + the controller artifact step (Task 5.4). ✓
- "Done when: comparison table/figures produced" (master plan §3): the deterministic fixture demonstrates the ablation in-suite; the live table is produced in Task 5.4 when Ollama is up. ✓

**Type consistency:** `StrategyMetricRow` (metrics) and `PerStrategyResult` (harness) share the `{ name, recallAtK, latencyMs, tokenCost }` shape; `toMarkdownTable` accepts `StrategyMetricRow[]` and `perStrategy` satisfies it. `EvalCorpusItem`/`EvalProbe`/`EvalDataset` defined in Task 2 and consumed unchanged in Task 3. `runMemoryEval(prisma, ollama: Pick<OllamaClient,'embed'>, callerUserId, opts)` defined in Task 3 and called identically in Task 4. `StrategyName` reused from `@/server/memory/types`. `getMemoryStrategy(name, { prisma, ollama })` matches the existing `StrategyDeps`. ✓

**Placeholder scan:** no TBD/TODO/"handle edge cases" — every code step shows full code. ✓

**Invariants enforced:** the route goes through `withUser`; the eval user is fully isolated and deleted in a `finally` (cascade); the caller's own memory is never read or mutated (only `MemoryRetrievalLog` rows are written for them); the harness reuses the production strategies unchanged. The dev-only gate returns 404 in production. ✓
