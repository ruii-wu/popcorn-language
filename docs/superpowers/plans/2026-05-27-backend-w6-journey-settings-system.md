# Backend W6 — Journey · Settings · System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Journey dashboard fully live and give the user real control: aggregate read endpoints (summary / relationships / streak), a read+write Settings surface (including the pluggable `memoryStrategy`), and system endpoints for local model listing and per-user data reset — plus an onboarding "finalize" that provisions a persisted `UserSettings` row.

**Architecture:** Thin Next.js App-Router route handlers over small, testable service helpers. All business endpoints go through `withUser` and scope every query by `userId` (multi-user isolation is the #1 invariant). No DB migration — every model (`UserSettings`, `RelationshipEvent`, `ActivityEvent`, `Memory`, `MemoryFact`, `UserAchievement`, `MemoryRetrievalLog`) already exists from W1. Reuses the W2 `computeStreak` util and the existing `OllamaClient` (extended with one new graceful method).

**Tech Stack:** Next.js 14 (App Router, TS), Prisma + SQLite, Zod, Vitest, Ollama HTTP API.

---

## Scope

**In scope (this plan):**
- `GET /api/journey/summary` · `GET /api/journey/relationships` · `GET /api/journey/streak` (spec §五.7, §十.C)
- `GET /api/settings` · `PUT /api/settings` incl. `memoryStrategy` (spec §五.9)
- `GET /api/system/models` · `POST /api/system/reset` (spec §五.9)
- Onboarding finalize: provision a `UserSettings` row at `onboarding/complete` so the Settings page reflects persisted state.

**Deferred / out of scope (documented decisions — SCOPE GUARD, do not implement):**
- `GET /api/system/health` already shipped in W1 — **leave it as-is** (public, no `withUser`). Do not refactor it.
- `GET /api/achievements` (spec §五.8) already shipped in W5. Not touched here.
- `POST /api/dev/memory-eval` + `MemoryRetrievalLog` eval harness → **W7**.
- Suggestion chips (`GET /api/threads/:npcId/suggestions`) → still deferred (was W5→W6 carryover; **not** required for "Journey dashboard fully live", so push to a later polish pass — do NOT add it here unless a task explicitly says so; no task does).
- Reverse relationship decay, dynamic achievements → P1.

**Decisions locked for this plan (so subagents don't re-litigate):**
1. **`system/reset` semantics:** wipe the caller's *content & progress* (relationships+events, threads→messages/summaries/scenario sessions/turns/summaries, memories, facts, unlocked achievements, activity events, retrieval logs) but **keep** the `User`, `UserProfile`, and `UserSettings` rows (identity + preferences survive, so the user stays logged in with their chosen settings). Requires `{ confirm: true }`.
2. **`journey/relationships` lists all seeded NPCs** (merged with the caller's relationship, defaulting to `acquaintance`/1 when none) — mirrors the existing `GET /api/npcs` philosophy so the dashboard is never empty.
3. **`journey/summary.conversations`** = `prisma.message.count({ where: { userId } })`. Because NPC messages store `userId = null`, this counts user-authored messages only — consistent with the already-shipped `auth/me` totals.
4. **`memoryStrategy` switching** needs no extra wiring: `getMemoryStrategy` reads `UserSettings.memoryStrategy` at request time (W3), so `PUT /api/settings` writing the row is sufficient for the switch to take effect.
5. **Settings "no row" rule:** `readSettings` returns `DEFAULT_SETTINGS` when no row exists (matches the existing "no settings row = defaults" behavior used by grammar/strategy readers). Do **not** refactor those existing readers.

---

## Conventions (match existing code)

- Route file: `export const dynamic = 'force-dynamic';` then `export async function GET/PUT/POST(req: Request): Promise<Response>` wrapped in `withUser(req, async (userId) => { ... })`.
- Helpers from `@/server/http/respond`: `json(data)`, `errorJson(status, code, message)`, `withUser(req, fn)`.
- DB singleton: `import { prisma } from '@/server/db/client';`.
- Tests import the route handler directly and call it with a `Request` carrying the session cookie:
  ```ts
  import { SESSION_COOKIE } from '@/server/auth/session';
  const withUid = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });
  ```
- Each integration test owns a unique username sentinel and cleans up in `afterAll` via `prisma.user.deleteMany({ where: { username: U } })` (cascade clears children).
- Commit per task (test + impl together), `git -c core.autocrlf=false commit` (Windows CRLF guard), prefix `feat:` / `test:` / `chore:`.
- Run a single test file: `npm run test -- tests/integration/<file>.test.ts`. Run all: `npm run test`. Typecheck: `npm run typecheck` (or `npx tsc --noEmit`).

## File Structure

| File | Responsibility |
|---|---|
| `src/server/llm/ollama.ts` *(modify)* | add `listModels()` — graceful local-model listing via `/api/tags` (+ `/api/ps` for `loaded`). |
| `src/app/api/system/models/route.ts` *(new)* | `GET` → thin wrapper over `listModels()`. |
| `src/server/users/reset.ts` *(new)* | `resetUserData(prisma, userId)` — user-scoped content/progress wipe, keeps identity+prefs. |
| `src/app/api/system/reset/route.ts` *(new)* | `POST { confirm:true }` → `resetUserData`. |
| `src/server/settings/settings.ts` *(new)* | `MEMORY_STRATEGIES`, `DEFAULT_SETTINGS`, `SettingsView`, `readSettings`, `SettingsPatch` (Zod), `writeSettings`. |
| `src/app/api/settings/route.ts` *(new)* | `GET` → `readSettings`; `PUT` → validate patch → `writeSettings`. |
| `src/app/api/onboarding/complete/route.ts` *(modify)* | provision a `UserSettings` row (finalize). |
| `src/app/api/journey/summary/route.ts` *(new)* | `GET` → `{ days, conversations, scenarios, memories }`. |
| `src/server/journey/relationships.ts` *(new)* | `buildRelationshipCards(prisma, userId)` → relationship cards. |
| `src/app/api/journey/relationships/route.ts` *(new)* | `GET` → `buildRelationshipCards`. |
| `src/app/api/journey/streak/route.ts` *(new)* | `GET` → `{ days, weekCount, perDay }`. |
| `docs/superpowers/plans/2026-05-25-backend-overall-plan.md` *(modify)* | mark W6 row DONE. |

---

## Task 1: `OllamaClient.listModels()`

**Files:**
- Modify: `src/server/llm/ollama.ts` (add a method to the class)
- Test: `tests/unit/ollama-models.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/ollama-models.test.ts
import { describe, it, expect } from 'vitest';
import { OllamaClient } from '@/server/llm/ollama';

function fakeFetch(handlers: Record<string, () => Response>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/api/tags')) return handlers.tags();
    if (u.includes('/api/ps')) return handlers.ps();
    throw new Error(`unexpected url ${u}`);
  }) as unknown as typeof fetch;
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('OllamaClient.listModels', () => {
  it('maps installed models to {name,sizeGB,loaded}, flagging loaded ones from /api/ps', async () => {
    const client = new OllamaClient({
      fetchImpl: fakeFetch({
        tags: () => ok({ models: [{ name: 'qwen2.5:7b-instruct', size: 4_700_000_000 }, { name: 'nomic-embed-text', size: 270_000_000 }] }),
        ps: () => ok({ models: [{ name: 'qwen2.5:7b-instruct' }] }),
      }),
    });
    const models = await client.listModels();
    expect(models).toEqual([
      { name: 'qwen2.5:7b-instruct', sizeGB: 4.7, loaded: true },
      { name: 'nomic-embed-text', sizeGB: 0.3, loaded: false },
    ]);
  });

  it('returns [] when /api/tags is unreachable (never throws)', async () => {
    const client = new OllamaClient({
      fetchImpl: (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch,
    });
    expect(await client.listModels()).toEqual([]);
  });

  it('degrades loaded=false when /api/ps fails but /api/tags works', async () => {
    const client = new OllamaClient({
      fetchImpl: fakeFetch({
        tags: () => ok({ models: [{ name: 'qwen2.5:7b-instruct', size: 4_700_000_000 }] }),
        ps: () => { throw new Error('ps down'); },
      }),
    });
    expect(await client.listModels()).toEqual([{ name: 'qwen2.5:7b-instruct', sizeGB: 4.7, loaded: false }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/ollama-models.test.ts`
Expected: FAIL — `client.listModels is not a function`.

- [ ] **Step 3: Implement `listModels`**

Add this method to the `OllamaClient` class in `src/server/llm/ollama.ts` (e.g. right after `health()`):

```ts
  async listModels(): Promise<{ name: string; sizeGB: number; loaded: boolean }[]> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/tags`, { method: 'GET' });
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: { name: string; size?: number }[] };
      const installed = Array.isArray(data.models) ? data.models : [];

      let loaded = new Set<string>();
      try {
        const ps = await this.fetchImpl(`${this.baseUrl}/api/ps`, { method: 'GET' });
        if (ps.ok) {
          const pd = (await ps.json()) as { models?: { name: string }[] };
          loaded = new Set((pd.models ?? []).map((m) => m.name));
        }
      } catch {
        /* /api/ps is optional — leave loaded empty on failure */
      }

      return installed.map((m) => ({
        name: m.name,
        sizeGB: typeof m.size === 'number' ? Math.round((m.size / 1e9) * 10) / 10 : 0,
        loaded: loaded.has(m.name),
      }));
    } catch {
      return [];
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/ollama-models.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/llm/ollama.ts tests/unit/ollama-models.test.ts
git -c core.autocrlf=false commit -m "feat: OllamaClient.listModels (graceful local model listing)"
```

---

## Task 2: `GET /api/system/models`

**Files:**
- Create: `src/app/api/system/models/route.ts`
- Test: `tests/integration/system-models-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/system-models-route.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { GET } from '@/app/api/system/models/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const withUid = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/system/models', () => {
  it('401s without a cookie', async () => {
    expect((await GET(new Request('http://x/'))).status).toBe(401);
  });

  it('returns the local model list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/api/tags')) return ok({ models: [{ name: 'qwen2.5:7b-instruct', size: 4_700_000_000 }] });
      if (u.includes('/api/ps')) return ok({ models: [] });
      throw new Error(`unexpected ${u}`);
    }));
    const res = await GET(withUid('u_models'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ name: 'qwen2.5:7b-instruct', sizeGB: 4.7, loaded: false }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/system-models-route.test.ts`
Expected: FAIL — cannot import `GET` from a non-existent route.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/system/models/route.ts
import { OllamaClient } from '@/server/llm/ollama';
import { withUser, json } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async () => {
    const models = await new OllamaClient().listModels();
    return json(models);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/system-models-route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/system/models/route.ts tests/integration/system-models-route.test.ts
git -c core.autocrlf=false commit -m "feat: GET /api/system/models"
```

---

## Task 3: `resetUserData` service

**Files:**
- Create: `src/server/users/reset.ts`
- Test: `tests/integration/reset-user-data.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/reset-user-data.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { resetUserData } from '@/server/users/reset';

const prisma = new PrismaClient();
const UA = '__w6_reset_a__';
const UB = '__w6_reset_b__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { in: [UA, UB] } } });
  await prisma.$disconnect();
});

// Creates a user with one of each user-owned content row.
async function seedUser(username: string) {
  const user = await prisma.user.create({ data: { username, password: 'pw' } });
  await prisma.userProfile.create({ data: { userId: user.id, role: 'Student', interests: '[]' } });
  await prisma.userSettings.create({ data: { userId: user.id } });
  const rel = await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily' } });
  await prisma.relationshipEvent.create({ data: { relationshipId: rel.id, fromStage: 'acquaintance', toStage: 'friend', reason: 'x' } });
  const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
  await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'hi' } });
  await prisma.memory.create({ data: { userId: user.id, title: 't', body: 'b', sourceType: 'chat_pattern' } });
  await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'has_pet', value: 'cat' } });
  await prisma.userAchievement.create({ data: { userId: user.id, achievementId: 'first_chat' } });
  await prisma.activityEvent.create({ data: { userId: user.id, type: 'message_sent' } });
  return user;
}

describe('resetUserData', () => {
  it('wipes the user\'s content/progress but keeps identity + preferences, and does not touch other users', async () => {
    await prisma.user.deleteMany({ where: { username: { in: [UA, UB] } } });
    const a = await seedUser(UA);
    const b = await seedUser(UB);

    await resetUserData(prisma, a.id);

    // A's content gone
    for (const n of [
      prisma.relationship.count({ where: { userId: a.id } }),
      prisma.thread.count({ where: { userId: a.id } }),
      prisma.message.count({ where: { userId: a.id } }),
      prisma.memory.count({ where: { userId: a.id } }),
      prisma.memoryFact.count({ where: { userId: a.id } }),
      prisma.userAchievement.count({ where: { userId: a.id } }),
      prisma.activityEvent.count({ where: { userId: a.id } }),
    ]) {
      expect(await n).toBe(0);
    }
    // A's identity + preferences kept
    expect(await prisma.user.count({ where: { id: a.id } })).toBe(1);
    expect(await prisma.userProfile.count({ where: { userId: a.id } })).toBe(1);
    expect(await prisma.userSettings.count({ where: { userId: a.id } })).toBe(1);

    // B is completely untouched (isolation)
    expect(await prisma.relationship.count({ where: { userId: b.id } })).toBe(1);
    expect(await prisma.message.count({ where: { userId: b.id } })).toBe(1);
    expect(await prisma.memory.count({ where: { userId: b.id } })).toBe(1);
    expect(await prisma.activityEvent.count({ where: { userId: b.id } })).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/reset-user-data.test.ts`
Expected: FAIL — cannot import `resetUserData`.

- [ ] **Step 3: Implement the service**

```ts
// src/server/users/reset.ts
import type { PrismaClient } from '@prisma/client';

// Wipes a single user's content & progress while keeping their identity and preferences
// (User, UserProfile, UserSettings survive). Every delete is scoped by userId — multi-user
// isolation is the #1 invariant. Children clean up via Prisma's onDelete: Cascade:
//   relationship  → relationshipEvent
//   thread        → message, conversationSummary, scenarioSession → scenarioTurn, scenarioSummary
export async function resetUserData(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.relationship.deleteMany({ where: { userId } }),
    prisma.thread.deleteMany({ where: { userId } }),
    prisma.memory.deleteMany({ where: { userId } }),
    prisma.memoryFact.deleteMany({ where: { userId } }),
    prisma.userAchievement.deleteMany({ where: { userId } }),
    prisma.activityEvent.deleteMany({ where: { userId } }),
    prisma.memoryRetrievalLog.deleteMany({ where: { userId } }),
  ]);
}
```

> Note: `scenarioSession` has both `userId` (Cascade from User) and `threadId` (Cascade from Thread). Deleting threads cascades the sessions (and their turns/summaries), so no explicit `scenarioSession.deleteMany` is needed. If a future schema change removes the thread→session cascade, add `prisma.scenarioSession.deleteMany({ where: { userId } })` before the thread delete.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/reset-user-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/users/reset.ts tests/integration/reset-user-data.test.ts
git -c core.autocrlf=false commit -m "feat: resetUserData (user-scoped content/progress wipe)"
```

---

## Task 4: `POST /api/system/reset`

**Files:**
- Create: `src/app/api/system/reset/route.ts`
- Test: `tests/integration/system-reset-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/system-reset-route.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST } from '@/app/api/system/reset/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w6_reset_route__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const post = (uid: string, body: unknown) =>
  new Request('http://x/', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${uid}` }, body: JSON.stringify(body) });

describe('POST /api/system/reset', () => {
  it('401s without a cookie', async () => {
    const res = await POST(new Request('http://x/', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });

  it('400s without confirm:true', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const res = await POST(post(user.id, { confirm: false }));
    expect(res.status).toBe(400);
    await prisma.user.deleteMany({ where: { username: U } });
  });

  it('wipes content and returns ok when confirmed', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.activityEvent.create({ data: { userId: user.id, type: 'message_sent' } });
    await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });

    const res = await POST(post(user.id, { confirm: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await prisma.activityEvent.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.thread.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1); // still logged-in
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/system-reset-route.test.ts`
Expected: FAIL — cannot import `POST` from a non-existent route.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/system/reset/route.ts
import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { resetUserData } from '@/server/users/reset';

export const dynamic = 'force-dynamic';

const Body = z.object({ confirm: z.literal(true) });

export async function POST(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(400, 'CONFIRM_REQUIRED', 'reset requires { confirm: true }');
    await resetUserData(prisma, userId);
    return json({ ok: true });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/system-reset-route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/system/reset/route.ts tests/integration/system-reset-route.test.ts
git -c core.autocrlf=false commit -m "feat: POST /api/system/reset (confirmed user data reset)"
```

---

## Task 5: Settings service (`readSettings` / `writeSettings`)

**Files:**
- Create: `src/server/settings/settings.ts`
- Test: `tests/integration/settings-service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/settings-service.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { readSettings, writeSettings, DEFAULT_SETTINGS } from '@/server/settings/settings';

const prisma = new PrismaClient();
const U = '__w6_settings_svc__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('settings service', () => {
  it('readSettings returns defaults when no row exists', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    expect(await readSettings(prisma, user.id)).toEqual(DEFAULT_SETTINGS);
  });

  it('writeSettings creates a row from a partial patch and merges over defaults', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const after = await writeSettings(prisma, user.id, { grammarCorrection: false, memoryStrategy: 'semantic' });
    expect(after.grammarCorrection).toBe(false);
    expect(after.memoryStrategy).toBe('semantic');
    expect(after.modelName).toBe(DEFAULT_SETTINGS.modelName); // untouched fields keep defaults
    // persisted
    expect((await readSettings(prisma, user.id)).memoryStrategy).toBe('semantic');
  });

  it('writeSettings updates an existing row, leaving unspecified fields intact', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const after = await writeSettings(prisma, user.id, { modelName: 'llama3.1:8b' });
    expect(after.modelName).toBe('llama3.1:8b');
    expect(after.grammarCorrection).toBe(false); // from the previous write, not reset
    expect(after.memoryStrategy).toBe('semantic');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/settings-service.test.ts`
Expected: FAIL — cannot import from `@/server/settings/settings`.

- [ ] **Step 3: Implement the service**

```ts
// src/server/settings/settings.ts
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';

export const MEMORY_STRATEGIES = ['recency', 'summary', 'semantic', 'hybrid'] as const;
export type MemoryStrategyName = (typeof MEMORY_STRATEGIES)[number];

export interface SettingsView {
  grammarCorrection: boolean;
  modelName: string;
  uiLanguage: string;
  voiceTTSEnabled: boolean;
  showAIRationale: boolean;
  memoryStrategy: MemoryStrategyName;
}

// Mirrors the UserSettings model defaults (spec §八).
export const DEFAULT_SETTINGS: SettingsView = {
  grammarCorrection: true,
  modelName: 'qwen2.5:7b-instruct',
  uiLanguage: 'zh-CN',
  voiceTTSEnabled: false,
  showAIRationale: true,
  memoryStrategy: 'hybrid',
};

// Zod patch for PUT /api/settings — every field optional (partial update).
export const SettingsPatch = z.object({
  grammarCorrection: z.boolean().optional(),
  modelName: z.string().min(1).optional(),
  uiLanguage: z.string().min(1).optional(),
  voiceTTSEnabled: z.boolean().optional(),
  showAIRationale: z.boolean().optional(),
  memoryStrategy: z.enum(MEMORY_STRATEGIES).optional(),
});
export type SettingsPatchInput = z.infer<typeof SettingsPatch>;

function toView(row: {
  grammarCorrection: boolean; modelName: string; uiLanguage: string;
  voiceTTSEnabled: boolean; showAIRationale: boolean; memoryStrategy: string;
}): SettingsView {
  const strat = (MEMORY_STRATEGIES as readonly string[]).includes(row.memoryStrategy)
    ? (row.memoryStrategy as MemoryStrategyName)
    : DEFAULT_SETTINGS.memoryStrategy;
  return {
    grammarCorrection: row.grammarCorrection,
    modelName: row.modelName,
    uiLanguage: row.uiLanguage,
    voiceTTSEnabled: row.voiceTTSEnabled,
    showAIRationale: row.showAIRationale,
    memoryStrategy: strat,
  };
}

// Effective settings: the row if present, else defaults (matches "no row = defaults").
export async function readSettings(prisma: PrismaClient, userId: string): Promise<SettingsView> {
  const row = await prisma.userSettings.findUnique({ where: { userId } });
  return row ? toView(row) : { ...DEFAULT_SETTINGS };
}

// Upsert a partial patch; returns the resulting effective settings.
export async function writeSettings(
  prisma: PrismaClient,
  userId: string,
  patch: SettingsPatchInput,
): Promise<SettingsView> {
  const row = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, ...patch },
    update: patch,
  });
  return toView(row);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/settings-service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/settings/settings.ts tests/integration/settings-service.test.ts
git -c core.autocrlf=false commit -m "feat: settings service (readSettings/writeSettings + defaults)"
```

---

## Task 6: `GET` + `PUT /api/settings`

**Files:**
- Create: `src/app/api/settings/route.ts`
- Test: `tests/integration/settings-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/settings-route.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET, PUT } from '@/app/api/settings/route';
import { SESSION_COOKIE } from '@/server/auth/session';
import { DEFAULT_SETTINGS } from '@/server/settings/settings';

const prisma = new PrismaClient();
const U = '__w6_settings_route__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const get = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });
const put = (uid: string, body: unknown) =>
  new Request('http://x/', { method: 'PUT', headers: { cookie: `${SESSION_COOKIE}=${uid}` }, body: JSON.stringify(body) });

describe('settings route', () => {
  it('GET 401s without a cookie', async () => {
    expect((await GET(new Request('http://x/'))).status).toBe(401);
  });

  it('GET returns defaults for a fresh user', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const res = await GET(get(user.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DEFAULT_SETTINGS);
  });

  it('PUT updates memoryStrategy and grammarCorrection, then GET reflects it', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const res = await PUT(put(user.id, { memoryStrategy: 'recency', grammarCorrection: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.settings.memoryStrategy).toBe('recency');
    const after = await (await GET(get(user.id))).json();
    expect(after.memoryStrategy).toBe('recency');
    expect(after.grammarCorrection).toBe(false);
  });

  it('PUT 400s on an invalid memoryStrategy', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const res = await PUT(put(user.id, { memoryStrategy: 'telepathy' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/settings-route.test.ts`
Expected: FAIL — cannot import from a non-existent route.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/settings/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { readSettings, writeSettings, SettingsPatch } from '@/server/settings/settings';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => json(await readSettings(prisma, userId)));
}

export async function PUT(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const parsed = SettingsPatch.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'invalid settings payload');
    const settings = await writeSettings(prisma, userId, parsed.data);
    return json({ ok: true, settings });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/settings-route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/settings/route.ts tests/integration/settings-route.test.ts
git -c core.autocrlf=false commit -m "feat: GET/PUT /api/settings (incl. memoryStrategy)"
```

---

## Task 7: Onboarding finalize — provision a `UserSettings` row

**Files:**
- Modify: `src/app/api/onboarding/complete/route.ts`
- Test: `tests/integration/onboarding.test.ts` (add a case; keep the existing one passing)

- [ ] **Step 1: Add the failing test case**

Append this `it(...)` inside the existing `describe('onboarding complete', ...)` block in `tests/integration/onboarding.test.ts` (do not change the existing test):

```ts
  it('provisions a UserSettings row so the Settings page has persisted state', async () => {
    const U2 = '__w6_onboarding_settings__';
    await prisma.user.deleteMany({ where: { username: U2 } });
    const user = await prisma.user.create({ data: { username: U2, password: 'pw' } });
    expect(await prisma.userSettings.count({ where: { userId: user.id } })).toBe(0);

    await POST(post(user.id));

    const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    expect(settings).not.toBeNull();
    expect(settings?.memoryStrategy).toBe('hybrid'); // schema default
    await prisma.user.deleteMany({ where: { username: U2 } });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/onboarding.test.ts`
Expected: the new case FAILS (`settings` is null); the existing case still PASSES.

- [ ] **Step 3: Implement — upsert a settings row**

In `src/app/api/onboarding/complete/route.ts`, add a `UserSettings` upsert alongside the existing relationship/thread upserts (place it right after the `prisma.relationship.upsert(...)` block, before the `prisma.thread.upsert(...)` call):

```ts
    await prisma.userSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/onboarding.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/onboarding/complete/route.ts tests/integration/onboarding.test.ts
git -c core.autocrlf=false commit -m "feat: provision UserSettings row at onboarding finalize"
```

---

## Task 8: `GET /api/journey/summary`

**Files:**
- Create: `src/app/api/journey/summary/route.ts`
- Test: `tests/integration/journey-summary-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/journey-summary-route.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/journey/summary/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w6_journey_summary__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const get = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('GET /api/journey/summary', () => {
  it('401s without a cookie', async () => {
    expect((await GET(new Request('http://x/'))).status).toBe(401);
  });

  it('aggregates streak days, user-message count, completed scenarios and memories', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'hi' } });
    await prisma.message.create({ data: { threadId: thread.id, userId: null, role: 'npc', text: 'hello' } }); // NPC msg not counted
    await prisma.activityEvent.create({ data: { userId: user.id, type: 'message_sent' } });
    await prisma.memory.create({ data: { userId: user.id, title: 't', body: 'b', sourceType: 'chat_pattern' } });

    const res = await GET(get(user.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.conversations).toBe(1); // only the user-authored message
    expect(body.scenarios).toBe(0);
    expect(body.memories).toBe(1);
    expect(body.days).toBe(1); // active today
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/journey-summary-route.test.ts`
Expected: FAIL — cannot import `GET` from a non-existent route.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/journey/summary/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';
import { computeStreak } from '@/server/users/streak';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const events = await prisma.activityEvent.findMany({
      where: { userId, type: 'message_sent' },
      select: { createdAt: true },
    });
    const { days } = computeStreak(events.map((e) => e.createdAt));

    const [conversations, scenarios, memories] = await Promise.all([
      prisma.message.count({ where: { userId } }),
      prisma.scenarioSession.count({ where: { userId, status: 'completed' } }),
      prisma.memory.count({ where: { userId } }),
    ]);

    return json({ days, conversations, scenarios, memories });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/journey-summary-route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/journey/summary/route.ts tests/integration/journey-summary-route.test.ts
git -c core.autocrlf=false commit -m "feat: GET /api/journey/summary"
```

---

## Task 9: `buildRelationshipCards` + `GET /api/journey/relationships`

**Files:**
- Create: `src/server/journey/relationships.ts`
- Create: `src/app/api/journey/relationships/route.ts`
- Test: `tests/integration/journey-relationships-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/journey-relationships-route.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/journey/relationships/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w6_journey_rel__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const get = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('GET /api/journey/relationships', () => {
  it('401s without a cookie', async () => {
    expect((await GET(new Request('http://x/'))).status).toBe(401);
  });

  it('returns a card per seeded NPC, with stage + latest-event note for ones the user has', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const rel = await prisma.relationship.create({
      data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2, relationshipPoints: 40, lastInteractionAt: new Date() },
    });
    await prisma.relationshipEvent.create({
      data: { relationshipId: rel.id, fromStage: 'acquaintance', toStage: 'friend', reason: 'msg_count_threshold' },
    });

    const res = await GET(get(user.id));
    expect(res.status).toBe(200);
    const cards = await res.json();
    // all seeded NPCs present (lily, chen, emma)
    expect(cards.length).toBeGreaterThanOrEqual(3);

    const lily = cards.find((c: { npcId: string }) => c.npcId === 'lily');
    expect(lily.stage).toBe('friend');
    expect(lily.stageValue).toBe(2);
    expect(lily.sub).toBe('Friend');
    expect(lily.note).toBe('acquaintance → friend');
    expect(lily.last).not.toBeNull();

    const chen = cards.find((c: { npcId: string }) => c.npcId === 'chen');
    expect(chen.stage).toBe('acquaintance'); // no relationship yet → defaults
    expect(chen.stageValue).toBe(1);
    expect(chen.note).toBeNull();
    expect(chen.last).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/journey-relationships-route.test.ts`
Expected: FAIL — cannot import `GET` from a non-existent route.

- [ ] **Step 3: Implement the builder + route**

```ts
// src/server/journey/relationships.ts
import type { PrismaClient } from '@prisma/client';

export interface RelationshipCard {
  npcId: string;
  name: string;
  stage: string;
  stageValue: number;
  sub: string;
  note: string | null;
  last: Date | null;
}

const SUB_LABEL: Record<string, string> = {
  acquaintance: 'Acquaintance',
  friend: 'Friend',
  close: 'Close friend',
};

// One card per seeded NPC (mirrors GET /api/npcs), merged with the caller's relationship.
// `note` is the most recent stage-change event; `last` is lastInteractionAt.
export async function buildRelationshipCards(prisma: PrismaClient, userId: string): Promise<RelationshipCard[]> {
  const npcs = await prisma.npc.findMany({ orderBy: { id: 'asc' } });
  const rels = await prisma.relationship.findMany({
    where: { userId },
    include: { events: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  const byNpc = new Map(rels.map((r) => [r.npcId, r]));

  return npcs.map((n) => {
    const rel = byNpc.get(n.id);
    const stage = rel?.stage ?? 'acquaintance';
    const ev = rel?.events[0];
    return {
      npcId: n.id,
      name: n.name,
      stage,
      stageValue: rel?.stageValue ?? 1,
      sub: SUB_LABEL[stage] ?? 'Acquaintance',
      note: ev ? `${ev.fromStage} → ${ev.toStage}` : null,
      last: rel?.lastInteractionAt ?? null,
    };
  });
}
```

```ts
// src/app/api/journey/relationships/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';
import { buildRelationshipCards } from '@/server/journey/relationships';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => json(await buildRelationshipCards(prisma, userId)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/journey-relationships-route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/journey/relationships.ts src/app/api/journey/relationships/route.ts tests/integration/journey-relationships-route.test.ts
git -c core.autocrlf=false commit -m "feat: GET /api/journey/relationships"
```

---

## Task 10: `GET /api/journey/streak`

**Files:**
- Create: `src/app/api/journey/streak/route.ts`
- Test: `tests/integration/journey-streak-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/journey-streak-route.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/journey/streak/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w6_journey_streak__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const get = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('GET /api/journey/streak', () => {
  it('401s without a cookie', async () => {
    expect((await GET(new Request('http://x/'))).status).toBe(401);
  });

  it('returns days, weekCount and a 7-length perDay array', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.activityEvent.create({ data: { userId: user.id, type: 'message_sent' } });

    const res = await GET(get(user.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.perDay).toHaveLength(7);
    expect(body.perDay[6]).toBe(1); // today active
    expect(body.weekCount).toBe(1);
    expect(body.days).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/journey-streak-route.test.ts`
Expected: FAIL — cannot import `GET` from a non-existent route.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/journey/streak/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';
import { computeStreak } from '@/server/users/streak';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const events = await prisma.activityEvent.findMany({
      where: { userId, type: 'message_sent' },
      select: { createdAt: true },
    });
    const { days, weekCount, perDay } = computeStreak(events.map((e) => e.createdAt));
    return json({ days, weekCount, perDay });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/journey-streak-route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/journey/streak/route.ts tests/integration/journey-streak-route.test.ts
git -c core.autocrlf=false commit -m "feat: GET /api/journey/streak"
```

---

## Task 11: Whole-suite verification + mark W6 done

**Files:**
- Modify: `docs/superpowers/plans/2026-05-25-backend-overall-plan.md` (W6 row)

- [ ] **Step 1: Run the full test suite + typecheck**

Run: `npm run test`
Expected: ALL tests pass (170 prior + the new W6 tests; ~18 new). Note `fileParallelism:false` is already set, so the SQLite suite is serialized.

Run: `npm run typecheck` (or `npx tsc --noEmit`)
Expected: exit 0, no errors.

If anything fails, STOP and fix before continuing — do not mark W6 done with a red suite.

- [ ] **Step 2: Update the master plan W6 row**

In `docs/superpowers/plans/2026-05-25-backend-overall-plan.md`, change the `**W6**` row in the §3 phase table from its current `Done when` text to a ✅ summary, matching the style of the W2–W5 rows. Set the first cell to `**W6** ✅` and replace the last cell with:

```
**DONE** — Journey aggregates (`GET /api/journey/summary` `{days,conversations,scenarios,memories}`, `/relationships` one card per NPC with stage+latest-event note+lastInteraction, `/streak` `{days,weekCount,perDay[7]}` via shared `computeStreak`); Settings read/write (`GET`/`PUT /api/settings`, partial Zod patch incl. `memoryStrategy` enum → live strategy switch; `readSettings` returns defaults when no row); System (`GET /api/system/models` via new graceful `OllamaClient.listModels`; `POST /api/system/reset` `{confirm:true}` → user-scoped content/progress wipe keeping identity+prefs); onboarding finalize provisions a `UserSettings` row. All tests pass, typecheck clean. **Deferred:** suggestion chips → later polish; memory-eval harness + `MemoryRetrievalLog` → W7.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-05-25-backend-overall-plan.md
git -c core.autocrlf=false commit -m "docs: mark W6 done in master plan"
```

---

## Self-Review (completed against spec §五.7/.9 + §十.C)

**Spec coverage:**
- §五.7 Journey/聚合: `journey/summary` (Task 8), `journey/relationships` (Task 9), `journey/streak` (Task 10). ✓
- §五.9 Settings/System: `GET`/`PUT /api/settings` (Tasks 5–6), `GET /api/system/models` (Tasks 1–2), `POST /api/system/reset` (Tasks 3–4). `GET /api/system/health` already shipped (W1) — explicitly out of scope. ✓
- §五.8 Achievements: already shipped W5 — out of scope. ✓
- Onboarding finalize: Task 7. ✓
- §十.C Journey Dashboard workflow (summary counts / relationships+note / sessions / memories / streak): summary+relationships+streak covered here; `scenarios/sessions` and `memories` list endpoints already shipped (W4/W3). ✓
- §五.10 memory-eval: deferred to W7 (documented). ✓

**Type consistency:** `SettingsView` / `DEFAULT_SETTINGS` / `MEMORY_STRATEGIES` / `SettingsPatch` defined in Task 5 and consumed unchanged in Task 6. `RelationshipCard` defined and consumed in Task 9. `listModels()` return shape `{name,sizeGB,loaded}` consistent across Tasks 1–2. `computeStreak` return `{days,weekCount,perDay}` consumed in Tasks 8 + 10 matches the existing util. ✓

**Placeholder scan:** no TBD/TODO/"handle edge cases" — every code step shows full code. ✓

**Invariants enforced:** every business route goes through `withUser`; every query/delete is scoped by `userId`; `resetUserData` is isolation-tested against a second user (Task 3); `listModels`/health never throw on a down Ollama. ✓
