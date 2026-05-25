# Backend W3 — Memory Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give NPCs durable memory — a pluggable `MemoryStrategy` interface (recency / summary / semantic / hybrid), LLM fact extraction + conversation summarization, recall wired into the chat prompt, and the right-panel "what X knows about you" + memories endpoints — so an NPC recalls facts across turns and the active strategy is switchable per user.

**Architecture:** A new `src/server/memory/` module. Pure helpers (`cosine`, `format`) have unit tests; strategy classes + writers (`factExtract`, `summarize`) are integration-tested against the seeded dev SQLite DB with a **mocked** Ollama client (never a live model). `recallForPrompt()` reads `UserSettings.memoryStrategy`, runs the chosen strategy, and feeds `facts[] + summary` into the existing `buildSystemPrompt`. `streamChat` calls recall before generation and `runPostTurnMemory` (fact extract + maybe-summarize, fully guarded) after the reply. Three read/delete REST endpoints surface the data to the right panel.

**Tech Stack:** TypeScript, Next.js 14 route handlers (Web `Response`), Prisma + SQLite, Zod, Vitest, Ollama HTTP client (`chatJson` / `embed`), `nomic-embed-text` embeddings stored as JSON `number[]` strings.

---

## Scope

### In scope (W3)
- `MemoryStrategy` interface + `RecallQuery` / `RecalledItem` types (spec §九).
- Four strategy implementations: `recency`, `summary`, `semantic`, `hybrid`.
- `cosineSimilarity` + embedding/format helpers.
- `getMemoryStrategy(name, deps)` factory; `recallForPrompt()` facade that honors `UserSettings.memoryStrategy`.
- `extractAndStoreFacts()` — LLM JSON fact extraction → `MemoryFact` (+ embedding).
- `maybeSummarizeThread()` — periodic LLM summarization → `ConversationSummary` (+ embedding).
- `runPostTurnMemory()` orchestrator; wired into `streamChat` (recall before, post-turn after).
- Right-panel endpoints: `GET /api/memories`, `GET /api/memories/recent`, `DELETE /api/memories/:id`; populate `GET /api/npcs/:id` `knownFacts[]`.

### Deferred (NOT in W3 — SCOPE GUARD)
- **`generateMemoryCard` (auto-creating `Memory` rows)** → **W4** (scenario payoff) + chat-pattern detection later. The three `Memory` endpoints are built now and operate on existing rows (empty until W4 populates them; tests seed rows directly).
- **`MemoryRetrievalLog` writes + eval harness (`/api/dev/memory-eval`, recall@k / latency / token)** → **W7**. W3 only locks the `MemoryStrategy` interface W7 builds on.
- **Cross-NPC propagation (`MemoryFact.knownToNpcs`)** → P1. In W3 every fact is known to all NPCs (recall is not npc-filtered for facts).
- **`PUT /api/settings` to change `memoryStrategy` at runtime** → **W6**. W3 reads the stored value (default `hybrid`); tests set it directly in the DB to prove the switch works.
- **True fire-and-forget Async Dispatcher** → later. W3 awaits `runPostTurnMemory` (guarded) before `done` for determinism; the reply has already fully streamed, so only the `done` event is marginally delayed.

## Conventions (match W2)
- Route handlers return Web-standard `Response` via `@/server/http/respond` helpers (`json`, `errorJson`, `withUser`); add `export const dynamic = 'force-dynamic';`.
- **SCOPE GUARD every commit:** `git status --short` first; `git add` only the task's named files; never `git add -A`/`.`. `.claude/settings.local.json` stays dirty (harness noise); `dev.db*` are gitignored. On Windows, if a commit is blocked by CRLF/autocrlf, retry the commit prefixed with `git -c core.autocrlf=false`.
- Unit tests (`tests/unit/`) run with no DB and no Ollama. Integration tests (`tests/integration/`) use `new PrismaClient()` against the seeded dev DB, unique `__w3_…__` usernames, and clean up in `afterAll`. Ollama is always mocked.
- Run a single test file: `npx vitest run tests/<path>` . Full suite: `npm run test`. Types: `npm run typecheck`.
- Branch: `backend/w3-memory-engine`.

## File Structure
```
src/server/memory/
  types.ts            # RecallQuery, RecalledItem, MemoryStrategy, StrategyDeps, Candidate, StrategyName
  format.ts           # factToText(), parseEmbedding()
  cosine.ts           # cosineSimilarity()
  candidates.ts       # loadCandidates() — facts + summaries → Candidate[]
  strategies/
    recency.ts        # RecencyStrategy
    summary.ts        # SummaryStrategy
    semantic.ts       # SemanticStrategy
    hybrid.ts         # HybridStrategy
  getStrategy.ts      # getMemoryStrategy(name, deps)
  recall.ts           # recallForPrompt(), listFacts()
  factExtract.ts      # extractAndStoreFacts()
  summarize.ts        # maybeSummarizeThread()
  postTurn.ts         # runPostTurnMemory()
src/app/api/memories/route.ts            # GET (list)
src/app/api/memories/recent/route.ts     # GET (recent cards for a NPC)
src/app/api/memories/[id]/route.ts       # DELETE
src/app/api/npcs/[id]/route.ts           # MODIFY: knownFacts via listFacts()
src/server/chat/streamChat.ts            # MODIFY: recall + runPostTurnMemory
tests/unit/                              # cosine, memory-format, get-strategy
tests/integration/                       # strategies, recall, fact-extract, summarize, post-turn, stream-chat-memory, memories-routes, npc-known-facts
```

---

### Task 1: Cosine similarity utility

**Files:**
- Create: `src/server/memory/cosine.ts`
- Test: `tests/unit/cosine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/cosine.test.ts
import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '@/server/memory/cosine';

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });
  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it('returns 0 for mismatched length or empty or zero vectors', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cosine.test.ts`
Expected: FAIL — cannot find module `@/server/memory/cosine`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/memory/cosine.ts
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/cosine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/server/memory/cosine.ts tests/unit/cosine.test.ts
git commit -m "feat: add cosine similarity util for memory recall"
```

---

### Task 2: Memory types + format helpers

**Files:**
- Create: `src/server/memory/types.ts`
- Create: `src/server/memory/format.ts`
- Test: `tests/unit/memory-format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/memory-format.test.ts
import { describe, it, expect } from 'vitest';
import { factToText, parseEmbedding } from '@/server/memory/format';

describe('memory format helpers', () => {
  it('factToText humanizes predicate and joins value', () => {
    expect(factToText('has_pet', 'a cat named Mochi')).toBe('has pet: a cat named Mochi');
    expect(factToText('works_as', 'software engineer')).toBe('works as: software engineer');
  });
  it('parseEmbedding parses a JSON number array, else null', () => {
    expect(parseEmbedding('[0.1,0.2,0.3]')).toEqual([0.1, 0.2, 0.3]);
    expect(parseEmbedding(null)).toBeNull();
    expect(parseEmbedding('not json')).toBeNull();
    expect(parseEmbedding('{"a":1}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/memory-format.test.ts`
Expected: FAIL — cannot find module `@/server/memory/format`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/memory/types.ts
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';

export type StrategyName = 'recency' | 'summary' | 'semantic' | 'hybrid';

export interface RecallQuery {
  userId: string;
  npcId?: string;
  queryText: string;
  k: number;
}

export interface RecalledItem {
  id: string;
  kind: 'fact' | 'summary';
  text: string;
  score: number;
}

export interface MemoryStrategy {
  readonly name: StrategyName;
  recall(q: RecallQuery): Promise<RecalledItem[]>;
}

export interface StrategyDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'embed'>;
}

export interface Candidate {
  id: string;
  kind: 'fact' | 'summary';
  text: string;
  embedding: number[] | null;
  createdAt: Date;
}
```

```ts
// src/server/memory/format.ts
export function factToText(predicate: string, value: string): string {
  return `${predicate.replace(/_/g, ' ')}: ${value}`;
}

export function parseEmbedding(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.every((n) => typeof n === 'number') ? (v as number[]) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/memory-format.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/server/memory/types.ts src/server/memory/format.ts tests/unit/memory-format.test.ts
git commit -m "feat: add MemoryStrategy types + format helpers"
```

---

### Task 3: Candidate loader + recency strategy

**Files:**
- Create: `src/server/memory/candidates.ts`
- Create: `src/server/memory/strategies/recency.ts`
- Test: `tests/integration/strategy-recency.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/strategy-recency.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { RecencyStrategy } from '@/server/memory/strategies/recency';

const prisma = new PrismaClient();
const U = '__w3_recency_user__';
const noEmbed = { embed: async () => [] as number[] };

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('RecencyStrategy', () => {
  it('returns the most recent facts + summaries newest-first, capped at k', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    const base = Date.now();
    for (let i = 0; i < 4; i++) {
      await prisma.memoryFact.create({
        data: { userId: user.id, predicate: 'likes', value: `thing${i}`, createdAt: new Date(base + i * 1000) },
      });
    }
    await prisma.conversationSummary.create({
      data: { threadId: thread.id, fromMsgId: 'a', toMsgId: 'b', summary: 'recent summary', createdAt: new Date(base + 10000) },
    });

    const strat = new RecencyStrategy({ prisma, ollama: noEmbed });
    const items = await strat.recall({ userId: user.id, npcId: 'lily', queryText: 'x', k: 3 });

    expect(items).toHaveLength(3);
    expect(items[0].kind).toBe('summary');
    expect(items[0].text).toBe('recent summary');
    expect(items[1].text).toBe('likes: thing3');
    expect(items[2].text).toBe('likes: thing2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/strategy-recency.test.ts`
Expected: FAIL — cannot find module `@/server/memory/strategies/recency`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/memory/candidates.ts
import type { PrismaClient } from '@prisma/client';
import type { Candidate } from './types';
import { factToText, parseEmbedding } from './format';

// Loads a user's recallable memory items. Facts are not npc-filtered in P0
// (every fact is known to all NPCs); summaries are scoped to the npc's thread when npcId is given.
export async function loadCandidates(
  prisma: PrismaClient,
  userId: string,
  npcId?: string,
): Promise<Candidate[]> {
  const [facts, summaries] = await Promise.all([
    prisma.memoryFact.findMany({ where: { userId } }),
    prisma.conversationSummary.findMany({
      where: { thread: { userId, ...(npcId ? { npcId } : {}) } },
    }),
  ]);
  const out: Candidate[] = [];
  for (const f of facts) {
    out.push({
      id: f.id,
      kind: 'fact',
      text: factToText(f.predicate, f.value),
      embedding: parseEmbedding(f.embedding),
      createdAt: f.createdAt,
    });
  }
  for (const s of summaries) {
    out.push({
      id: s.id,
      kind: 'summary',
      text: s.summary,
      embedding: parseEmbedding(s.embedding),
      createdAt: s.createdAt,
    });
  }
  return out;
}
```

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/strategy-recency.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/server/memory/candidates.ts src/server/memory/strategies/recency.ts tests/integration/strategy-recency.test.ts
git commit -m "feat: add candidate loader + recency memory strategy"
```

---

### Task 4: Summary strategy

**Files:**
- Create: `src/server/memory/strategies/summary.ts`
- Test: `tests/integration/strategy-summary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/strategy-summary.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SummaryStrategy } from '@/server/memory/strategies/summary';

const prisma = new PrismaClient();
const U = '__w3_summary_user__';
const noEmbed = { embed: async () => [] as number[] };

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('SummaryStrategy', () => {
  it('returns the latest summary first, then all facts (unranked)', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'has_pet', value: 'a cat' } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'works_as', value: 'engineer' } });
    await prisma.conversationSummary.create({
      data: { threadId: thread.id, fromMsgId: 'a', toMsgId: 'b', summary: 'old', createdAt: new Date(Date.now() - 5000) },
    });
    await prisma.conversationSummary.create({
      data: { threadId: thread.id, fromMsgId: 'c', toMsgId: 'd', summary: 'newest', createdAt: new Date() },
    });

    const strat = new SummaryStrategy({ prisma, ollama: noEmbed });
    const items = await strat.recall({ userId: user.id, npcId: 'lily', queryText: 'x', k: 6 });

    expect(items[0].kind).toBe('summary');
    expect(items[0].text).toBe('newest');
    const facts = items.filter((i) => i.kind === 'fact').map((i) => i.text);
    expect(facts).toContain('has pet: a cat');
    expect(facts).toContain('works as: engineer');
    // only one (the latest) summary is included
    expect(items.filter((i) => i.kind === 'summary')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/strategy-summary.test.ts`
Expected: FAIL — cannot find module `@/server/memory/strategies/summary`.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/strategy-summary.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/server/memory/strategies/summary.ts tests/integration/strategy-summary.test.ts
git commit -m "feat: add summary memory strategy"
```

---

### Task 5: Semantic strategy

**Files:**
- Create: `src/server/memory/strategies/semantic.ts`
- Test: `tests/integration/strategy-semantic.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/strategy-semantic.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SemanticStrategy } from '@/server/memory/strategies/semantic';

const prisma = new PrismaClient();
const U = '__w3_semantic_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('SemanticStrategy', () => {
  it('ranks candidates by cosine similarity to the query embedding, top-k', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    // query embed = [1,0]; "cat" aligned with it, "weather" orthogonal
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'has_pet', value: 'cat', embedding: JSON.stringify([1, 0]) } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'topic', value: 'weather', embedding: JSON.stringify([0, 1]) } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'no_embed', value: 'ignored' } }); // null embedding skipped

    const ollama = { embed: vi.fn().mockResolvedValue([1, 0]) };
    const strat = new SemanticStrategy({ prisma, ollama });
    const items = await strat.recall({ userId: user.id, queryText: 'tell me about your pet', k: 1 });

    expect(ollama.embed).toHaveBeenCalledWith('tell me about your pet');
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('has pet: cat');
    expect(items[0].score).toBeGreaterThan(0.9);
  });

  it('returns [] without calling embed when no candidate has an embedding', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    await prisma.memoryFact.deleteMany({ where: { userId: user.id } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'no_embed', value: 'x' } });
    const ollama = { embed: vi.fn() };
    const strat = new SemanticStrategy({ prisma, ollama });
    const items = await strat.recall({ userId: user.id, queryText: 'q', k: 5 });
    expect(items).toEqual([]);
    expect(ollama.embed).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/strategy-semantic.test.ts`
Expected: FAIL — cannot find module `@/server/memory/strategies/semantic`.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/strategy-semantic.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/server/memory/strategies/semantic.ts tests/integration/strategy-semantic.test.ts
git commit -m "feat: add semantic memory strategy"
```

---

### Task 6: Hybrid strategy

**Files:**
- Create: `src/server/memory/strategies/hybrid.ts`
- Test: `tests/integration/strategy-hybrid.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/strategy-hybrid.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { HybridStrategy } from '@/server/memory/strategies/hybrid';

const prisma = new PrismaClient();
const U = '__w3_hybrid_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('HybridStrategy', () => {
  it('blends semantic similarity with recency decay', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const now = Date.now();
    // Both equally similar to query [1,0]; "fresh" is newer so should rank first.
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'p', value: 'fresh', embedding: JSON.stringify([1, 0]), createdAt: new Date(now) } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'p', value: 'stale', embedding: JSON.stringify([1, 0]), createdAt: new Date(now - 30 * 24 * 3.6e6) } });

    const ollama = { embed: vi.fn().mockResolvedValue([1, 0]) };
    const strat = new HybridStrategy({ prisma, ollama }, () => now);
    const items = await strat.recall({ userId: user.id, queryText: 'q', k: 2 });

    expect(items[0].text).toBe('p: fresh');
    expect(items[1].text).toBe('p: stale');
    expect(items[0].score).toBeGreaterThan(items[1].score);
  });

  it('falls back to recency order when nothing is embedded (no embed call)', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    await prisma.memoryFact.deleteMany({ where: { userId: user.id } });
    const now = Date.now();
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'p', value: 'older', createdAt: new Date(now - 1000) } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'p', value: 'newer', createdAt: new Date(now) } });
    const ollama = { embed: vi.fn() };
    const strat = new HybridStrategy({ prisma, ollama }, () => now);
    const items = await strat.recall({ userId: user.id, queryText: 'q', k: 2 });
    expect(items.map((i) => i.text)).toEqual(['p: newer', 'p: older']);
    expect(ollama.embed).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/strategy-hybrid.test.ts`
Expected: FAIL — cannot find module `@/server/memory/strategies/hybrid`.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/strategy-hybrid.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/server/memory/strategies/hybrid.ts tests/integration/strategy-hybrid.test.ts
git commit -m "feat: add hybrid memory strategy"
```

---

### Task 7: Strategy factory

**Files:**
- Create: `src/server/memory/getStrategy.ts`
- Test: `tests/unit/get-strategy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/get-strategy.test.ts
import { describe, it, expect } from 'vitest';
import { getMemoryStrategy } from '@/server/memory/getStrategy';

const deps = { prisma: {} as never, ollama: { embed: async () => [] as number[] } };

describe('getMemoryStrategy', () => {
  it('returns the strategy whose name matches', () => {
    expect(getMemoryStrategy('recency', deps).name).toBe('recency');
    expect(getMemoryStrategy('summary', deps).name).toBe('summary');
    expect(getMemoryStrategy('semantic', deps).name).toBe('semantic');
    expect(getMemoryStrategy('hybrid', deps).name).toBe('hybrid');
  });
  it('falls back to hybrid for unknown names', () => {
    expect(getMemoryStrategy('nonsense', deps).name).toBe('hybrid');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/get-strategy.test.ts`
Expected: FAIL — cannot find module `@/server/memory/getStrategy`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/memory/getStrategy.ts
import type { MemoryStrategy, StrategyDeps } from './types';
import { RecencyStrategy } from './strategies/recency';
import { SummaryStrategy } from './strategies/summary';
import { SemanticStrategy } from './strategies/semantic';
import { HybridStrategy } from './strategies/hybrid';

export function getMemoryStrategy(name: string, deps: StrategyDeps): MemoryStrategy {
  switch (name) {
    case 'recency':
      return new RecencyStrategy(deps);
    case 'summary':
      return new SummaryStrategy(deps);
    case 'semantic':
      return new SemanticStrategy(deps);
    case 'hybrid':
    default:
      return new HybridStrategy(deps);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/get-strategy.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/server/memory/getStrategy.ts tests/unit/get-strategy.test.ts
git commit -m "feat: add memory strategy factory"
```

---

### Task 8: Recall facade + listFacts

**Files:**
- Create: `src/server/memory/recall.ts`
- Test: `tests/integration/recall.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/recall.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { recallForPrompt, listFacts } from '@/server/memory/recall';

const prisma = new PrismaClient();
const U = '__w3_recall_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('recallForPrompt', () => {
  it('honors the user memoryStrategy and splits facts vs summary', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({
      data: { username: U, password: 'pw', settings: { create: { memoryStrategy: 'recency' } } },
    });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'has_pet', value: 'a cat named Mochi' } });
    await prisma.conversationSummary.create({ data: { threadId: thread.id, fromMsgId: 'a', toMsgId: 'b', summary: 'discussed cats' } });

    const ollama = { embed: vi.fn() };
    const out = await recallForPrompt({ prisma, ollama, userId: user.id, npcId: 'lily', queryText: 'hello' });

    expect(out.facts).toContain('has pet: a cat named Mochi');
    expect(out.summary).toBe('discussed cats');
    expect(ollama.embed).not.toHaveBeenCalled(); // recency needs no embedding
  });

  it('never throws — returns empty on internal error', async () => {
    const ollama = { embed: vi.fn() };
    const out = await recallForPrompt({ prisma, ollama, userId: 'does-not-exist', queryText: 'x' });
    expect(out).toEqual({ facts: [], summary: undefined });
  });

  it('listFacts returns formatted fact strings newest-first', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'works_as', value: 'engineer' } });
    const facts = await listFacts(prisma, user.id, 8);
    expect(facts).toContain('works as: engineer');
    expect(facts).toContain('has pet: a cat named Mochi');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/recall.test.ts`
Expected: FAIL — cannot find module `@/server/memory/recall`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/memory/recall.ts
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';
import type { RecalledItem } from './types';
import { getMemoryStrategy } from './getStrategy';
import { factToText } from './format';

export interface RecalledForPrompt {
  facts: string[];
  summary?: string;
}

export interface RecallDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'embed'>;
  userId: string;
  npcId?: string;
  queryText: string;
  k?: number;
}

// High-level recall used by the chat pipeline and the NPC panel.
// Reads UserSettings.memoryStrategy (default 'hybrid'); never throws (recall must not break a chat turn).
export async function recallForPrompt(deps: RecallDeps): Promise<RecalledForPrompt> {
  const k = deps.k ?? 6;
  let items: RecalledItem[] = [];
  try {
    const settings = await deps.prisma.userSettings.findUnique({ where: { userId: deps.userId } });
    const strategy = getMemoryStrategy(settings?.memoryStrategy ?? 'hybrid', {
      prisma: deps.prisma,
      ollama: deps.ollama,
    });
    items = await strategy.recall({ userId: deps.userId, npcId: deps.npcId, queryText: deps.queryText, k });
  } catch (e) {
    console.error('[memory] recall failed, continuing with no memory', e);
    items = [];
  }
  return {
    facts: items.filter((i) => i.kind === 'fact').map((i) => i.text),
    summary: items.find((i) => i.kind === 'summary')?.text,
  };
}

// Flat list of a user's known facts for the "What X knows about you" panel.
export async function listFacts(prisma: PrismaClient, userId: string, limit = 8): Promise<string[]> {
  const facts = await prisma.memoryFact.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return facts.map((f) => factToText(f.predicate, f.value));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/recall.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/server/memory/recall.ts tests/integration/recall.test.ts
git commit -m "feat: add recallForPrompt facade + listFacts"
```

---

### Task 9: Fact extraction (extractAndStoreFacts)

**Files:**
- Create: `src/server/memory/factExtract.ts`
- Test: `tests/integration/fact-extract.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/fact-extract.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { extractAndStoreFacts } from '@/server/memory/factExtract';

const prisma = new PrismaClient();
const U = '__w3_factextract_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('extractAndStoreFacts', () => {
  it('persists extracted facts with embeddings and skips duplicates', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });

    const ollama = {
      chatJson: vi.fn().mockResolvedValue({
        facts: [
          { subject: 'user', predicate: 'has_pet', value: 'a cat named Mochi', confidence: 0.9 },
          { subject: 'user', predicate: 'works_as', value: 'software engineer', confidence: 0.8 },
        ],
      }),
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };

    const n1 = await extractAndStoreFacts({ prisma, ollama, userId: user.id, text: "I have a cat named Mochi and I'm a software engineer", sourceMsgId: 'msg1' });
    expect(n1).toBe(2);

    const stored = await prisma.memoryFact.findMany({ where: { userId: user.id }, orderBy: { predicate: 'asc' } });
    expect(stored.map((f) => f.predicate)).toEqual(['has_pet', 'works_as']);
    expect(stored[0].embedding).toBe(JSON.stringify([0.1, 0.2, 0.3]));
    expect(stored[0].sourceMsgId).toBe('msg1');
    expect(ollama.embed).toHaveBeenCalledTimes(2);

    // second run with the same facts → no duplicates
    const n2 = await extractAndStoreFacts({ prisma, ollama, userId: user.id, text: 'same again' });
    expect(n2).toBe(0);
    expect(await prisma.memoryFact.count({ where: { userId: user.id } })).toBe(2);
  });

  it('stores facts with null embedding when embed fails (does not throw)', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const ollama = {
      chatJson: vi.fn().mockResolvedValue({ facts: [{ subject: 'user', predicate: 'lives_near', value: 'Brooklyn', confidence: 0.7 }] }),
      embed: vi.fn().mockRejectedValue(new Error('embed down')),
    };
    const n = await extractAndStoreFacts({ prisma, ollama, userId: user.id, text: 'I live in Brooklyn' });
    expect(n).toBe(1);
    const f = await prisma.memoryFact.findFirstOrThrow({ where: { userId: user.id, predicate: 'lives_near' } });
    expect(f.embedding).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/fact-extract.test.ts`
Expected: FAIL — cannot find module `@/server/memory/factExtract`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/memory/factExtract.ts
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient, ChatMessage } from '@/server/llm/ollama';

const FactSchema = z.object({
  subject: z.string().default('user'),
  predicate: z.string().min(1),
  value: z.string().min(1),
  confidence: z.number().min(0).max(1).default(0.7),
});
export const FactsSchema = z.object({ facts: z.array(FactSchema) });

const SYSTEM_PROMPT =
  'You extract durable personal facts about the user from their chat message. ' +
  'Return JSON {"facts": [{"subject":"user","predicate":<snake_case>,"value":<short string>,"confidence":<0..1>}]}. ' +
  'Use predicates like has_pet, works_as, lives_near, studies_for, likes, dislikes, goal. ' +
  'Only include stable, personal facts worth remembering long-term. ' +
  'If the message contains none, return {"facts": []}. No prose outside the JSON.';

export interface FactExtractDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson' | 'embed'>;
  userId: string;
  text: string;
  sourceMsgId?: string;
  context?: string;
}

// Extracts facts from the user's message and stores new ones (dedup by predicate+value). Returns count stored.
export async function extractAndStoreFacts(deps: FactExtractDeps): Promise<number> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: (deps.context ? `Earlier context:\n${deps.context}\n\n` : '') + `Message:\n${deps.text}` },
  ];
  const out = await deps.ollama.chatJson(messages, FactsSchema);

  let stored = 0;
  for (const f of out.facts) {
    const existing = await deps.prisma.memoryFact.findFirst({
      where: { userId: deps.userId, predicate: f.predicate, value: f.value },
    });
    if (existing) continue;

    let embedding: string | null = null;
    try {
      embedding = JSON.stringify(await deps.ollama.embed(f.value));
    } catch (e) {
      console.error('[memory] embed failed for fact, storing without embedding', e);
      embedding = null;
    }

    await deps.prisma.memoryFact.create({
      data: {
        userId: deps.userId,
        subject: f.subject,
        predicate: f.predicate,
        value: f.value,
        confidence: f.confidence,
        embedding,
        sourceMsgId: deps.sourceMsgId ?? null,
      },
    });
    stored++;
  }
  return stored;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/fact-extract.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/server/memory/factExtract.ts tests/integration/fact-extract.test.ts
git commit -m "feat: add LLM fact extraction into MemoryFact"
```

---

### Task 10: Conversation summarization (maybeSummarizeThread)

**Files:**
- Create: `src/server/memory/summarize.ts`
- Test: `tests/integration/summarize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/summarize.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { maybeSummarizeThread } from '@/server/memory/summarize';

const prisma = new PrismaClient();
const U = '__w3_summarize_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

async function seedMessages(threadId: string, userId: string, n: number) {
  const base = Date.now();
  for (let i = 0; i < n; i++) {
    await prisma.message.create({
      data: { threadId, userId: i % 2 === 0 ? userId : null, role: i % 2 === 0 ? 'user' : 'npc', text: `m${i}`, createdAt: new Date(base + i * 1000) },
    });
  }
}

describe('maybeSummarizeThread', () => {
  it('no-ops below the threshold', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await seedMessages(thread.id, user.id, 8); // < SUMMARY_EVERY (10)
    const ollama = { chatJson: vi.fn(), embed: vi.fn() };
    const result = await maybeSummarizeThread({ prisma, ollama, threadId: thread.id });
    expect(result).toBeNull();
    expect(ollama.chatJson).not.toHaveBeenCalled();
    expect(await prisma.conversationSummary.count({ where: { threadId: thread.id } })).toBe(0);
  });

  it('summarizes the first window once the thread is long enough, then is idempotent', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const thread = await prisma.thread.findFirstOrThrow({ where: { userId: user.id, npcId: 'lily' } });
    await prisma.message.deleteMany({ where: { threadId: thread.id } });
    await seedMessages(thread.id, user.id, 14); // due = floor((14-4)/10) = 1

    const ollama = {
      chatJson: vi.fn().mockResolvedValue({ summary: 'they talked about m0..m9' }),
      embed: vi.fn().mockResolvedValue([0.5, 0.5]),
    };
    const first = await maybeSummarizeThread({ prisma, ollama, threadId: thread.id });
    expect(first).toBe('they talked about m0..m9');
    const rows = await prisma.conversationSummary.findMany({ where: { threadId: thread.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].embedding).toBe(JSON.stringify([0.5, 0.5]));

    // second call: existing(1) >= due(1) → no-op
    const second = await maybeSummarizeThread({ prisma, ollama, threadId: thread.id });
    expect(second).toBeNull();
    expect(await prisma.conversationSummary.count({ where: { threadId: thread.id } })).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/summarize.test.ts`
Expected: FAIL — cannot find module `@/server/memory/summarize`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/memory/summarize.ts
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';

export const SUMMARY_EVERY = 10; // summarize one window per this many messages
export const KEEP_RECENT = 4; // never summarize the live tail (kept verbatim in the recent buffer)

const SummarySchema = z.object({ summary: z.string().min(1) });

export interface SummarizeDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson' | 'embed'>;
  threadId: string;
}

// Summarizes the next un-summarized window of a thread when it grows past KEEP_RECENT + SUMMARY_EVERY.
// Deterministic: the number of summaries that should exist is floor((total - KEEP_RECENT) / SUMMARY_EVERY).
export async function maybeSummarizeThread(deps: SummarizeDeps): Promise<string | null> {
  const total = await deps.prisma.message.count({ where: { threadId: deps.threadId } });
  const due = Math.floor((total - KEEP_RECENT) / SUMMARY_EVERY);
  if (due < 1) return null;

  const existing = await deps.prisma.conversationSummary.count({ where: { threadId: deps.threadId } });
  if (existing >= due) return null;

  const start = existing * SUMMARY_EVERY;
  const windowMsgs = await deps.prisma.message.findMany({
    where: { threadId: deps.threadId },
    orderBy: { createdAt: 'asc' },
    skip: start,
    take: SUMMARY_EVERY,
  });
  if (windowMsgs.length === 0) return null;

  const transcript = windowMsgs.map((m) => `${m.userId ? 'User' : 'NPC'}: ${m.text}`).join('\n');
  const { summary } = await deps.ollama.chatJson(
    [
      { role: 'system', content: 'Summarize this conversation excerpt in 2-3 sentences, focusing on durable facts, preferences and topics. Return JSON {"summary": string}.' },
      { role: 'user', content: transcript },
    ],
    SummarySchema,
  );

  let embedding: string | null = null;
  try {
    embedding = JSON.stringify(await deps.ollama.embed(summary));
  } catch (e) {
    console.error('[memory] embed failed for summary, storing without embedding', e);
    embedding = null;
  }

  await deps.prisma.conversationSummary.create({
    data: {
      threadId: deps.threadId,
      fromMsgId: windowMsgs[0].id,
      toMsgId: windowMsgs[windowMsgs.length - 1].id,
      summary,
      embedding,
    },
  });
  return summary;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/summarize.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/server/memory/summarize.ts tests/integration/summarize.test.ts
git commit -m "feat: add periodic conversation summarization"
```

---

### Task 11: Post-turn memory orchestrator

**Files:**
- Create: `src/server/memory/postTurn.ts`
- Test: `tests/integration/post-turn-memory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/post-turn-memory.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runPostTurnMemory } from '@/server/memory/postTurn';

const prisma = new PrismaClient();
const U = '__w3_postturn_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('runPostTurnMemory', () => {
  it('extracts facts and is fully guarded against LLM failure', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });

    const ollama = {
      chatJson: vi.fn().mockResolvedValue({ facts: [{ subject: 'user', predicate: 'has_pet', value: 'a dog', confidence: 0.9 }] }),
      embed: vi.fn().mockResolvedValue([1, 2]),
    };
    await runPostTurnMemory({ prisma, ollama, userId: user.id, threadId: thread.id, userText: 'I have a dog', userMsgId: 'm1' });
    expect(await prisma.memoryFact.count({ where: { userId: user.id, predicate: 'has_pet' } })).toBe(1);

    // failure path: chatJson throws → no throw out of runPostTurnMemory
    const failing = { chatJson: vi.fn().mockRejectedValue(new Error('llm down')), embed: vi.fn() };
    await expect(
      runPostTurnMemory({ prisma, ollama: failing, userId: user.id, threadId: thread.id, userText: 'x', userMsgId: 'm2' }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/post-turn-memory.test.ts`
Expected: FAIL — cannot find module `@/server/memory/postTurn`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/memory/postTurn.ts
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';
import { extractAndStoreFacts } from './factExtract';
import { maybeSummarizeThread } from './summarize';

export interface PostTurnDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson' | 'embed'>;
  userId: string;
  threadId: string;
  userText: string;
  userMsgId: string;
}

// Runs after the NPC reply: extract new facts from the user's turn + maybe summarize the thread.
// Each step is independently guarded — memory work must never break the chat response.
export async function runPostTurnMemory(deps: PostTurnDeps): Promise<void> {
  try {
    await extractAndStoreFacts({
      prisma: deps.prisma,
      ollama: deps.ollama,
      userId: deps.userId,
      text: deps.userText,
      sourceMsgId: deps.userMsgId,
    });
  } catch (e) {
    console.error('[memory] factExtract failed', e);
  }

  try {
    await maybeSummarizeThread({ prisma: deps.prisma, ollama: deps.ollama, threadId: deps.threadId });
  } catch (e) {
    console.error('[memory] summarize failed', e);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/post-turn-memory.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/server/memory/postTurn.ts tests/integration/post-turn-memory.test.ts
git commit -m "feat: add post-turn memory orchestrator"
```

---

### Task 12: Wire recall + post-turn memory into streamChat

**Files:**
- Modify: `src/server/chat/streamChat.ts`
- Test: `tests/integration/stream-chat-memory.test.ts`

**Context:** `streamChat` currently builds the system prompt without `facts`/`recentSummary` and ends after relationship/activity updates. This task injects recalled memory into the prompt and runs `runPostTurnMemory` (awaited, guarded) before `done`. The existing W2 tests (`tests/integration/stream-chat.test.ts`, `tests/integration/messages-post.test.ts`) must stay green — recall and post-turn are both guarded so a mocked/unreachable Ollama yields no memory and never breaks the stream.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/stream-chat-memory.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OllamaClient } from '@/server/llm/ollama';
import { streamChat } from '@/server/chat/streamChat';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const U = '__w3_streammem_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

function ndjson(lines: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(l + '\n'));
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe('streamChat memory integration', () => {
  it('recalls a known fact into the system prompt for the turn', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({
      data: { username: U, password: 'pw', settings: { create: { memoryStrategy: 'recency' } } },
    });
    // a fact the NPC should remember
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'has_pet', value: 'a cat named Mochi' } });

    let chatMessages: { role: string; content: string }[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      if (b.stream === true) {
        chatMessages = b.messages; // the streaming chat call carries the system prompt
        return ndjson([JSON.stringify({ message: { content: 'meow' }, done: true })]);
      }
      // factExtract chatJson (stream:false, format:json) → return no new facts
      return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ facts: [] }) } }) } as unknown as Response;
    });
    const ollama = new OllamaClient({ fetchImpl });

    const events: SseEvent[] = [];
    for await (const e of streamChat({ prisma, ollama, userId: user.id, npcId: 'lily', text: 'what do you remember?' })) {
      events.push(e);
    }

    const system = chatMessages.find((m) => m.role === 'system');
    expect(system?.content).toContain('a cat named Mochi');
    expect(events[events.length - 1].event).toBe('done');
    expect(events.find((e) => e.event === 'message_complete')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/stream-chat-memory.test.ts`
Expected: FAIL — system prompt does not contain the fact (recall not wired yet).

- [ ] **Step 3: Modify `streamChat`**

In `src/server/chat/streamChat.ts`, add the imports near the top:

```ts
import { recallForPrompt } from '@/server/memory/recall';
import { runPostTurnMemory } from '@/server/memory/postTurn';
```

Replace the `Promise.all([...])` + `buildSystemPrompt(...)` block (the recent-buffer fetch and prompt build) with one that also recalls memory:

```ts
  const [profile, user, recent, recalled] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.message.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: 'desc' }, take: RECENT_BUFFER }),
    recallForPrompt({ prisma, ollama, userId, npcId, queryText: text }),
  ]);
  const history = recent.reverse();

  const systemPrompt = buildSystemPrompt({
    npc: {
      name: npc.name,
      personaPrompt: npc.personaPrompt,
      languageProfile: JSON.parse(npc.languageProfile),
    },
    userProfile: profile
      ? { role: profile.role, goal: profile.goal, interests: JSON.parse(profile.interests) }
      : undefined,
    relationshipStage: rel.stage as 'acquaintance' | 'friend' | 'close',
    userLanguage: user?.language ?? 'zh-CN',
    facts: recalled.facts,
    recentSummary: recalled.summary,
    mode: 'casual',
  });
```

Then, immediately before the final `yield { event: 'done', data: {} };`, add the post-turn memory work:

```ts
  await runPostTurnMemory({ prisma, ollama, userId, threadId: thread.id, userText: text, userMsgId: userMsg.id });

  yield { event: 'done', data: {} };
```

- [ ] **Step 4: Run the new test + the W2 regression suite**

Run: `npx vitest run tests/integration/stream-chat-memory.test.ts tests/integration/stream-chat.test.ts tests/integration/messages-post.test.ts`
Expected: PASS — new memory test green; both W2 stream tests still green (recall returns nothing for their mocks; post-turn swallows the LLM error).

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/server/chat/streamChat.ts tests/integration/stream-chat-memory.test.ts
git commit -m "feat: wire memory recall + post-turn extraction into streamChat"
```

---

### Task 13: Memories list + recent endpoints

**Files:**
- Create: `src/app/api/memories/route.ts`
- Create: `src/app/api/memories/recent/route.ts`
- Test: `tests/integration/memories-routes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/memories-routes.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET as listMemories } from '@/app/api/memories/route';
import { GET as recentMemories } from '@/app/api/memories/recent/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w3_memories_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const get = (uid: string, qs = '') => new Request('http://x/' + qs, { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('memories endpoints', () => {
  it('lists user memories, filters by npcId, and recent returns trimmed cards', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.memory.create({ data: { userId: user.id, title: 'Cat Person', body: 'Loves cats', npcId: 'lily', sourceType: 'chat_pattern' } });
    await prisma.memory.create({ data: { userId: user.id, title: 'Cross', body: 'general', npcId: null, sourceType: 'chat_pattern' } });
    await prisma.memory.create({ data: { userId: user.id, title: 'Hidden', body: 'gone', sourceType: 'chat_pattern', dismissedAt: new Date() } });

    const all = await (await listMemories(get(user.id))).json();
    expect(all.map((m: { title: string }) => m.title)).toContain('Cat Person');
    expect(all.map((m: { title: string }) => m.title)).not.toContain('Hidden'); // dismissed excluded

    const lily = await (await listMemories(get(user.id, '?npcId=lily'))).json();
    expect(lily.every((m: { npcId: string | null }) => m.npcId === 'lily')).toBe(true);

    const recent = await (await recentMemories(get(user.id, '?npcId=lily'))).json();
    // recent includes the npc's cards + cross-NPC observations, shape {id,title,body}
    expect(recent[0]).toHaveProperty('title');
    expect(recent.map((m: { title: string }) => m.title)).toEqual(expect.arrayContaining(['Cat Person', 'Cross']));
  });

  it('401s without a cookie', async () => {
    expect((await listMemories(new Request('http://x/'))).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/memories-routes.test.ts`
Expected: FAIL — cannot find module `@/app/api/memories/route`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/memories/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const url = new URL(req.url);
    const npcId = url.searchParams.get('npcId') ?? undefined;
    const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 50), 100);

    const rows = await prisma.memory.findMany({
      where: { userId, dismissedAt: null, ...(npcId ? { npcId } : {}) },
      orderBy: { noticedAt: 'desc' },
      take: limit,
    });

    return json(
      rows.map((m) => ({
        id: m.id,
        title: m.title,
        body: m.body,
        noticedAt: m.noticedAt,
        sourceType: m.sourceType,
        sourceRef: m.sourceRef,
        npcId: m.npcId,
      })),
    );
  });
}
```

```ts
// src/app/api/memories/recent/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

// Right-panel "What X knows" / "Memories from this chat": the npc's cards plus cross-NPC observations.
export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const url = new URL(req.url);
    const npcId = url.searchParams.get('npcId') ?? undefined;

    const rows = await prisma.memory.findMany({
      where: { userId, dismissedAt: null, ...(npcId ? { OR: [{ npcId }, { npcId: null }] } : {}) },
      orderBy: { noticedAt: 'desc' },
      take: 5,
    });

    return json(rows.map((m) => ({ id: m.id, title: m.title, body: m.body })));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/memories-routes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/app/api/memories/route.ts src/app/api/memories/recent/route.ts tests/integration/memories-routes.test.ts
git commit -m "feat: add memories list + recent endpoints"
```

---

### Task 14: Delete memory endpoint

**Files:**
- Create: `src/app/api/memories/[id]/route.ts`
- Test: `tests/integration/memories-delete.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/memories-delete.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DELETE } from '@/app/api/memories/[id]/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w3_memdel_user__';
const OTHER = '__w3_memdel_other__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { in: [U, OTHER] } } });
  await prisma.$disconnect();
});

const del = (uid: string) => new Request('http://x/', { method: 'DELETE', headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('DELETE /api/memories/:id', () => {
  it('deletes the caller own memory and 404s for another user memory', async () => {
    await prisma.user.deleteMany({ where: { username: { in: [U, OTHER] } } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const other = await prisma.user.create({ data: { username: OTHER, password: 'pw' } });
    const mine = await prisma.memory.create({ data: { userId: user.id, title: 'mine', body: 'b', sourceType: 'chat_pattern' } });
    const theirs = await prisma.memory.create({ data: { userId: other.id, title: 'theirs', body: 'b', sourceType: 'chat_pattern' } });

    // cannot delete another user's memory — scoped lookup returns 404, row survives
    expect((await DELETE(del(user.id), { params: { id: theirs.id } })).status).toBe(404);
    expect(await prisma.memory.count({ where: { id: theirs.id } })).toBe(1);

    // own memory deletes
    const ok = await (await DELETE(del(user.id), { params: { id: mine.id } })).json();
    expect(ok.ok).toBe(true);
    expect(await prisma.memory.count({ where: { id: mine.id } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/memories-delete.test.ts`
Expected: FAIL — cannot find module `@/app/api/memories/[id]/route`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/memories/[id]/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

export async function DELETE(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const mem = await prisma.memory.findFirst({ where: { id: params.id, userId } });
    if (!mem) return errorJson(404, 'NOT_FOUND', 'No such memory');
    await prisma.memory.delete({ where: { id: mem.id } });
    return json({ ok: true });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/memories-delete.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git status --short
git add "src/app/api/memories/[id]/route.ts" tests/integration/memories-delete.test.ts
git commit -m "feat: add delete memory endpoint (user-scoped)"
```

---

### Task 15: Populate NPC detail knownFacts

**Files:**
- Modify: `src/app/api/npcs/[id]/route.ts`
- Test: `tests/integration/npc-known-facts.test.ts`

**Context:** `GET /api/npcs/:id` currently returns `knownFacts: []` with a `// W3: Memory.recall()` placeholder. Replace it with `listFacts()`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/npc-known-facts.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET as detail } from '@/app/api/npcs/[id]/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w3_knownfacts_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const req = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('npc detail knownFacts', () => {
  it('returns the user known facts as formatted strings', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'has_pet', value: 'a cat named Mochi' } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'works_as', value: 'engineer' } });

    const d = await (await detail(req(user.id), { params: { id: 'lily' } })).json();
    expect(d.knownFacts).toContain('has pet: a cat named Mochi');
    expect(d.knownFacts).toContain('works as: engineer');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/npc-known-facts.test.ts`
Expected: FAIL — `knownFacts` is `[]`.

- [ ] **Step 3: Modify the route**

In `src/app/api/npcs/[id]/route.ts`, add the import:

```ts
import { listFacts } from '@/server/memory/recall';
```

Replace the `knownFacts: []` line in the returned object with:

```ts
      knownFacts: await listFacts(prisma, userId, 8),
```

- [ ] **Step 4: Run the new test + the W2 npc test**

Run: `npx vitest run tests/integration/npc-known-facts.test.ts tests/integration/npcs.test.ts`
Expected: PASS — new test green; W2 `npcs.test.ts` still green (`knownFacts` is still an array; with no facts it is empty).

- [ ] **Step 5: Commit**

```bash
git status --short
git add "src/app/api/npcs/[id]/route.ts" tests/integration/npc-known-facts.test.ts
git commit -m "feat: populate npc detail knownFacts via memory recall"
```

---

### Task 16: Full-suite verification + mark phase done

**Files:**
- Modify: `docs/superpowers/plans/2026-05-25-backend-overall-plan.md`

- [ ] **Step 1: Run the full suite + typecheck**

Run: `npm run test`
Expected: PASS — all W1 + W2 + W3 tests green (no regressions).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Mark W3 done in the master plan**

In `docs/superpowers/plans/2026-05-25-backend-overall-plan.md`, change the W3 row's `Done when` cell to reference this plan file and summarize what shipped (mirror the W2 ✅ row style): MemoryStrategy interface + recency/summary/semantic/hybrid, factExtract, summarize, recall wired into chat (NPC recalls facts across turns), memoryStrategy switch honored, memories endpoints + npc knownFacts. Note deferred: memory cards auto-gen → W4, MemoryRetrievalLog/eval → W7.

- [ ] **Step 3: Commit**

```bash
git status --short
git add docs/superpowers/plans/2026-05-25-backend-overall-plan.md
git commit -m "docs: mark W3 (memory engine) complete in master plan"
```

---

## Self-Review

**1. Spec coverage (§七 M3, §九, §五.6):**
- MemoryStrategy interface + RecallQuery/RecalledItem → Task 2. ✓
- recency / summary / semantic / hybrid → Tasks 3–6. ✓
- strategy selection by `UserSettings.memoryStrategy` (the "switch works" done-when) → Tasks 7–8 (`getMemoryStrategy` + `recallForPrompt` reads settings; the stream test sets `memoryStrategy='recency'`). ✓
- 3 memory layers: recent buffer (W2, already in streamChat) + summary (Task 10) + long-term facts (Task 9). ✓
- recall(query) → Tasks 3–8; summarize(threadId) → Task 10; extractFacts(messages) → Task 9. ✓
- recall wired into prompt; "NPC recalls facts across turns" → Task 12. ✓
- right panel: `knownFacts` (Task 15), `GET /api/memories` + `/recent` (Task 13), `DELETE` (Task 14). ✓
- `generateMemoryCard` → explicitly deferred to W4 (Scope). The endpoints exist and operate on rows scenarios will create. ✓ (intentional gap, documented)
- eval harness + `MemoryRetrievalLog` → explicitly deferred to W7 (Scope). ✓ (intentional gap, documented)

**2. Placeholder scan:** No TBD/TODO/"handle errors"; every code step has full code; commands have expected output. The only `// W3: Memory.recall()` placeholder (in the existing npc route) is removed in Task 15. ✓

**3. Type consistency:**
- `StrategyDeps.ollama` is `Pick<OllamaClient,'embed'>`; semantic/hybrid only need `embed`. `FactExtractDeps.ollama`/`SummarizeDeps.ollama`/`PostTurnDeps.ollama` use `Pick<…,'chatJson'|'embed'>`. `streamChat` passes the full `OllamaClient`, which satisfies all `Pick`s. ✓
- `RecalledItem {id,kind,text,score}` is produced identically by all four strategies and consumed by `recallForPrompt` (filters `kind==='fact'` vs `'summary'`). ✓
- `loadCandidates` returns `Candidate {id,kind,text,embedding,createdAt}`, used uniformly by all strategies. ✓
- `buildSystemPrompt` already accepts `facts?: string[]` and `recentSummary?: string` (verified in `src/server/prompt/types.ts`); Task 12 passes `recalled.facts` / `recalled.summary` into exactly those fields. ✓
- `factToText` output (`"has pet: a cat named Mochi"`) is asserted consistently across Tasks 3, 4, 8, 9, 11, 12, 15. ✓
- `maybeSummarizeThread` constants `SUMMARY_EVERY=10`, `KEEP_RECENT=4` drive the Task 10 `due = floor((total-4)/10)` assertions (8 msgs → 0; 14 msgs → 1). ✓

**Backward-compatibility note:** recall (Task 12) is guarded inside `recallForPrompt` and skips embedding when no candidate is embedded, so the W2 stream tests (mocked/unreachable Ollama, fresh users with no facts) produce empty memory and unchanged event sequences. `runPostTurnMemory` is guarded per-step, so a failing/again-mocked `chatJson` is swallowed and never alters the W2 assertions (no `Message` rows, no extra `ActivityEvent`s created by memory work). Task 12 Step 4 and Task 16 Step 1 explicitly re-run the W2 suites to confirm.
