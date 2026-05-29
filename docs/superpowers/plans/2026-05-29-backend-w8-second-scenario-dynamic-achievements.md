# Backend W8 — 2nd Scenario (Flat Viewing) + Dynamic Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver W8's stretch demo content — (1) a second roleplay scenario, **Flat Viewing with Emma**, proving the W4 orchestrator is genuinely template-driven; and (2) the **AI-Generated Dynamic Achievements** P1 angle (spec Module 9): a periodic/on-demand LLM that mints a personalized, earned achievement per user, persisted as `AchievementDef(isDynamic=true)` + `UserAchievement`, surfaced through the existing achievements list **without leaking across users**.

**Architecture:** The scenario half is pure data — a new `ScenarioTemplate` seed + a new `scenarioRole` on the existing `emma` NPC; the generic orchestrator (trigger → accept → turn loop → end) already handles any template, so no engine code changes. The achievements half is additive: a new `generateDynamicAchievement` service (LLM `chatJson` + strict Zod + graceful fallback, mirroring `factExtract`/scenario-turn), a thin `POST /api/achievements/generate` route, plus a small **owner-scoping** fix to `GET /api/achievements` and the static achievement tick so per-user dynamic defs stay private. No new Prisma model — `AchievementDef.isDynamic`, `ScenarioTemplate`, and `Npc.scenarioRoles` all already exist.

**Tech Stack:** Next.js 14 (App Router, TS), Prisma + SQLite, Zod, Vitest, Ollama HTTP API (`chatJson`).

---

## Scope

**In scope (this plan):**
- 2nd scenario template **Flat Viewing** (`emma` roleplaying a flat host) — seed data + a new `scenarioRole` on `emma` (spec §五.5, §七 M4 reuse, W8 row).
- Dynamic Achievements (spec §三 P1, §七 Module 9): `generateDynamicAchievement` service + `POST /api/achievements/generate`.
- Owner-scope dynamic defs in `GET /api/achievements` and exclude them from the static `runAchievementTick` (multi-user isolation — the #1 invariant).
- Mark W8 done in the master plan.

**Deferred / out of scope (documented decisions — SCOPE GUARD, do not implement):**
- Cross-NPC Memory Network (Module 8) — the *other* P1 angle; NOT chosen for W8. Do not touch `knownToNpcs` propagation or the recall/candidates path.
- A scheduler/cron for "periodic" generation — there is no job runner; generation is **on-demand** via the route (the realistic local-demo form of "periodic"). Do not add a cron.
- AI Reflective Companion, Code-Switching gameplay (other P1s) → later.
- Re-offer tuning after a decline, reverse relationship decay → still deferred (P1).
- No new scenario *engine* code — the orchestrator is already template-agnostic (verified: nothing hardcodes `mock_interview`/`hr_manager`).

**Decisions locked for this plan (so subagents don't re-litigate):**
1. **Flat Viewing uses `emma`** with a new role `flat_host` (Emma currently has `scenarioRoles: []`). `minStage: 'friend'` and `estimatedTurns: 5`, mirroring the `mock_interview` shape so the generic loop's HUD/turn math is unchanged.
2. **Seed `update` must refresh `scenarioRoles`.** `prisma/seed.ts` currently upserts NPCs with `update: {}`, so re-seeding will NOT apply Emma's new role to the existing row. Change the NPC upsert's `update` to `{ scenarioRoles: JSON.stringify(n.scenarioRoles) }`. The new template is a new id → created fresh; templates' `update: {}` stays.
3. **Dynamic defs are owned, enabled, and earned.** A generated `AchievementDef` has `isDynamic: true`, `enabled: true`, `rule: 'dynamic'` (deliberately NOT a key in `RULES`, so the static engine can never (re)evaluate it), `ruleConfig: JSON.stringify({ ownerUserId })`, and a unique `id = 'dyn_' + randomUUID()`. A `UserAchievement` is created in the same transaction (it is immediately earned).
4. **Isolation via the unlocked-join, not a broadcast.** `GET /api/achievements` lists static enabled defs to everyone, then **appends only the caller's own unlocked dynamic achievements**. The static query is narrowed to `isDynamic: false`, and `runAchievementTick` likewise only scans `isDynamic: false`. Net: a user never sees another user's dynamic achievement.
5. **Generation is best-effort and deduped.** `generateDynamicAchievement` never throws (returns `null` on LLM failure) and returns `null` if the produced title (case-insensitively) duplicates a title the user already has. The route is a normal `withUser` route (NOT dev-gated) — dynamic achievements are user-facing content.

---

## Conventions (match existing code)

- Route file: `export const dynamic = 'force-dynamic';` then `export async function GET/POST(req: Request): Promise<Response>` wrapped in `withUser(req, async (userId) => { ... })` from `@/server/http/respond` (`json`, `errorJson`, `withUser`).
- DB singleton: `import { prisma } from '@/server/db/client';`. Ollama: `import { OllamaClient } from '@/server/llm/ollama';` (`chatJson(messages, zodSchema)` posts to `/api/chat` with `format:'json'`, retries, then `schema.parse`).
- LLM service shape (see `factExtract.ts`): a Zod schema + a system prompt; deps take `ollama: Pick<OllamaClient, 'chatJson'>`; wrap the LLM call in try/catch and degrade gracefully.
- Tests import the route/service directly and call with a `Request` carrying the session cookie:
  ```ts
  import { SESSION_COOKIE } from '@/server/auth/session';
  const withUid = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });
  ```
  Service tests inject a mock ollama `{ chatJson: vi.fn().mockResolvedValue(...) }` (see `scenario-accept.test.ts`). Route tests stub global `fetch` for `/api/chat` (see `memory-eval-route.test.ts`).
- Each integration test owns a unique username sentinel and cleans up in `afterAll` via `prisma.user.deleteMany({ where: { username: U } })` (cascade clears children). `vitest.config.ts` already sets `fileParallelism:false` (SQLite single-writer).
- Commit per task (test + impl together), `git -c core.autocrlf=false commit` (Windows CRLF guard), prefix `feat:` / `test:` / `chore:` / `docs:`.
- Run a single test file: `npm run test -- tests/<path>.test.ts`. Run all: `npm run test`. Typecheck: `npm run typecheck`. Re-seed dev DB: `npm run db:seed`.

## File Structure

| File | Responsibility |
|---|---|
| `prisma/seed-data.ts` *(modify)* | add `flat_host` role to `emma`; add the `flat_viewing` `ScenarioTemplate`. |
| `prisma/seed.ts` *(modify)* | NPC upsert `update` refreshes `scenarioRoles` (so Emma's new role lands on re-seed). |
| `src/server/achievements/dynamic.ts` *(new)* | `generateDynamicAchievement(prisma, ollama, userId)` — LLM-authored, owner-scoped, graceful, deduped. |
| `src/app/api/achievements/generate/route.ts` *(new)* | `POST` → `generateDynamicAchievement` → `{ achievement }`. |
| `src/app/api/achievements/route.ts` *(modify)* | list static defs to all + append the caller's own unlocked dynamic achievements. |
| `src/server/achievements/engine.ts` *(modify)* | `runAchievementTick` scans only `isDynamic: false` defs. |
| `docs/superpowers/plans/2026-05-25-backend-overall-plan.md` *(modify)* | mark W8 row DONE. |

---

## Task 1: 2nd scenario — Flat Viewing with Emma (seed + tests)

**Files:**
- Modify: `prisma/seed-data.ts`, `prisma/seed.ts`
- Test: `tests/integration/scenario-flat-viewing.test.ts`

This task is data + a re-seed; the generic orchestrator needs no code change. TDD here means: write the test (red because the template/role aren't seeded yet), seed the data, watch it pass.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/scenario-flat-viewing.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { judgeScenarioTrigger } from '@/server/scenario/trigger';
import { acceptScenario } from '@/server/scenario/accept';

const prisma = new PrismaClient();
const U = '__w8_flat_viewing__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

async function warmedThread(userTurns: number) {
  await prisma.user.deleteMany({ where: { username: U } });
  const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
  const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'emma' } });
  await prisma.relationship.create({ data: { userId: user.id, npcId: 'emma', stage: 'friend', stageValue: 2 } });
  for (let i = 0; i < userTurns; i++) {
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: `m${i}` } });
  }
  return { user, thread };
}

describe('Flat Viewing scenario (emma)', () => {
  it('is seeded, enabled, and bound to emma via the flat_host role', async () => {
    const t = await prisma.scenarioTemplate.findUnique({ where: { id: 'flat_viewing' } });
    expect(t).not.toBeNull();
    expect(t?.npcId).toBe('emma');
    expect(t?.enabled).toBe(true);
    expect(t?.rolePlayedBy).toBe('flat_host');

    const emma = await prisma.npc.findUniqueOrThrow({ where: { id: 'emma' } });
    const roles = JSON.parse(emma.scenarioRoles) as { id: string }[];
    expect(roles.some((r) => r.id === 'flat_host')).toBe(true);
  });

  it('triggers for emma when warmed up, at friend stage, on a housing keyword', async () => {
    const { user, thread } = await warmedThread(4);
    const hit = await judgeScenarioTrigger({
      prisma, userId: user.id, npcId: 'emma', threadId: thread.id,
      text: 'could we practise a flat viewing? i need to find a room',
    });
    expect(hit?.template.id).toBe('flat_viewing');
    expect(hit?.rationale.topicMatch).toBe('flat');
  });

  it('accepts and opens a roleplay turn with the template turn budget', async () => {
    const { user, thread } = await warmedThread(4);
    const session = await prisma.scenarioSession.create({
      data: { userId: user.id, npcId: 'emma', threadId: thread.id, templateId: 'flat_viewing', status: 'invited' },
    });
    const ollama = {
      chatJson: vi.fn().mockResolvedValue({
        npcReply: 'Hiya! Come in — the room is just down the hall. What sort of budget are you on?',
        stateDelta: { impression: 0, stress: 'Low' },
        isFinalTurn: false,
        suggestedChoicesNext: [{ id: 'c1', text: 'Around £800 a month.', tone: 'Friendly', desc: '' }],
      }),
      embed: vi.fn(),
    };
    const result = await acceptScenario({ prisma, ollama, userId: user.id, sessionId: session.id });
    expect(result.openingMessage.text.length).toBeGreaterThan(0);
    expect(result.state.turnsLeft).toBe(5); // flat_viewing estimatedTurns
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('active');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/scenario-flat-viewing.test.ts`
Expected: FAIL — `flat_viewing` template is not seeded (first case fails; trigger returns null).

- [ ] **Step 3: Add the seed data + make the NPC upsert refresh roles, then re-seed**

In `prisma/seed-data.ts`, give Emma a scenario role. Replace Emma's `scenarioRoles: [],` line with:

```ts
    scenarioRoles: [{ id: 'flat_host', name: 'Emma', voice: 'chatty, friendly, British', defaultStress: 'Low' }],
```

In `prisma/seed-data.ts`, append a second entry to the `SCENARIO_TEMPLATES` array (after the `mock_interview` object):

```ts
  {
    id: 'flat_viewing', title: 'Flat Viewing', titleZh: '租房看房',
    npcId: 'emma', rolePlayedBy: 'flat_host', minStage: 'friend',
    estimatedMinutes: 6, estimatedTurns: 5,
    registerTags: ['Everyday register', 'Polite questions'],
    systemPrompt:
      'Roleplay: you are Emma, a current tenant showing the user a spare room in your shared flat. Be friendly but practical — describe the room, ask about their budget, move-in date, and living habits, and answer questions about rent, bills, and the area. Stay in character with light British expressions. Keep each reply to 1-3 sentences.',
    topicKeywords: ['flat', 'apartment', 'rent', 'room', 'viewing', 'move', 'flatmate', 'housing', 'lease', 'tenant'],
    enabled: true,
  },
```

In `prisma/seed.ts`, change the NPC upsert so re-seeding refreshes the role on the existing `emma` row. Replace the NPC upsert's `update: {},` with:

```ts
      update: { scenarioRoles: JSON.stringify(n.scenarioRoles) },
```

Then re-seed the dev DB:

Run: `npm run db:seed`
Expected: `Seeded 3 NPCs, 2 scenario(s), 6 achievements.`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/scenario-flat-viewing.test.ts`
Expected: PASS (3 tests).

Also run `npm run typecheck` — expect exit 0.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed-data.ts prisma/seed.ts tests/integration/scenario-flat-viewing.test.ts
git -c core.autocrlf=false commit -m "feat: Flat Viewing scenario (2nd template, emma flat_host role)"
```

---

## Task 2: `generateDynamicAchievement` service

**Files:**
- Create: `src/server/achievements/dynamic.ts`
- Test: `tests/integration/dynamic-achievement.test.ts`

A best-effort LLM service that mints ONE personalized achievement from the user's behavior + known facts, persists an owned `AchievementDef(isDynamic=true)` + `UserAchievement`, and degrades to `null` on failure or duplicate title.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/dynamic-achievement.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { generateDynamicAchievement } from '@/server/achievements/dynamic';

const prisma = new PrismaClient();
const U = '__w8_dyn_ach__';

afterAll(async () => {
  // remove dynamic defs created for this user's achievements, then the user
  const u = await prisma.user.findFirst({ where: { username: U } });
  if (u) {
    const mine = await prisma.userAchievement.findMany({ where: { userId: u.id } });
    await prisma.user.deleteMany({ where: { username: U } });
    await prisma.achievementDef.deleteMany({ where: { id: { in: mine.map((m) => m.achievementId) }, isDynamic: true } });
  }
  await prisma.$disconnect();
});

describe('generateDynamicAchievement', () => {
  it('mints an owned dynamic achievement (def isDynamic + UserAchievement) and returns it', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.activityEvent.create({ data: { userId: user.id, type: 'message_sent' } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'has_pet', value: 'cat' } });

    const ollama = {
      chatJson: vi.fn().mockResolvedValue({ title: 'Cat Whisperer', description: 'You bonded over your cat.', icon: '🐱' }),
    };
    const ach = await generateDynamicAchievement(prisma, ollama, user.id);

    expect(ach).not.toBeNull();
    expect(ach!.title).toBe('Cat Whisperer');
    expect(ach!.id.startsWith('dyn_')).toBe(true);

    const def = await prisma.achievementDef.findUniqueOrThrow({ where: { id: ach!.id } });
    expect(def.isDynamic).toBe(true);
    expect(def.enabled).toBe(true);
    expect(def.rule).toBe('dynamic');
    expect(JSON.parse(def.ruleConfig!).ownerUserId).toBe(user.id);
    expect(await prisma.userAchievement.count({ where: { userId: user.id, achievementId: ach!.id } })).toBe(1);
  });

  it('returns null (and creates nothing) when the LLM fails', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const before = await prisma.userAchievement.count({ where: { userId: user.id } });
    const ollama = { chatJson: vi.fn().mockRejectedValue(new Error('LLM down')) };
    expect(await generateDynamicAchievement(prisma, ollama, user.id)).toBeNull();
    expect(await prisma.userAchievement.count({ where: { userId: user.id } })).toBe(before);
  });

  it('returns null when the generated title duplicates one the user already has', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const before = await prisma.userAchievement.count({ where: { userId: user.id } });
    // 'First Chat' is a seeded static title; case-insensitive duplicate must be skipped.
    const ollama = { chatJson: vi.fn().mockResolvedValue({ title: 'first chat', description: 'dup', icon: '⭐' }) };
    expect(await generateDynamicAchievement(prisma, ollama, user.id)).toBeNull();
    expect(await prisma.userAchievement.count({ where: { userId: user.id } })).toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/dynamic-achievement.test.ts`
Expected: FAIL — cannot import `generateDynamicAchievement`.

- [ ] **Step 3: Implement the service**

```ts
// src/server/achievements/dynamic.ts
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient, ChatMessage } from '@/server/llm/ollama';
import { buildAchievementContext } from './engine';

const DynamicAchievementSchema = z.object({
  title: z.string().min(1).max(40),
  description: z.string().min(1).max(160),
  icon: z.string().min(1).max(8),
});

export interface DynamicAchievementView {
  id: string;
  title: string;
  description: string;
  icon: string;
}

const SYSTEM_PROMPT =
  'You craft ONE short, fun, personalized achievement for a language learner based on their activity stats and known facts. ' +
  'Return strict JSON {"title": <up to 5 words>, "description": <one encouraging sentence>, "icon": <single emoji>}. ' +
  'Make it specific to their behavior. Do NOT reuse any of the existing titles. No prose outside the JSON.';

// P1 Module 9: mint a personalized, LLM-authored achievement. Persists an owned
// AchievementDef(isDynamic=true) + a UserAchievement (it is immediately earned). Returns the
// new achievement, or null when the LLM fails or the title duplicates one the user already has.
// Never throws — best-effort enrichment, safe to fire after a turn or from a button.
export async function generateDynamicAchievement(
  prisma: PrismaClient,
  ollama: Pick<OllamaClient, 'chatJson'>,
  userId: string,
): Promise<DynamicAchievementView | null> {
  try {
    const ctx = await buildAchievementContext(prisma, userId);
    const facts = await prisma.memoryFact.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 8,
    });
    const existing = await currentTitles(prisma, userId);

    const profile = [
      `messages sent: ${ctx.messageSentCount}`,
      `scenarios completed: ${ctx.completedScenarioCount}`,
      `best scenario grade: ${ctx.bestGrade}`,
      `NPCs at friend+: ${ctx.npcsAtFriendPlus}/${ctx.totalNpcs}`,
      `chat streak (days): ${ctx.streakDays}`,
      `used both zh+en: ${ctx.hasBilingualThread}`,
      `known facts: ${facts.map((f) => `${f.predicate.replace(/_/g, ' ')}: ${f.value}`).join('; ') || 'none'}`,
    ].join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Learner profile:\n${profile}\n\nExisting titles (avoid these): ${existing.join(', ') || 'none'}`,
      },
    ];
    const out = await ollama.chatJson(messages, DynamicAchievementSchema);

    const norm = out.title.trim().toLowerCase();
    if (existing.some((t) => t.trim().toLowerCase() === norm)) return null; // duplicate — skip

    const id = `dyn_${randomUUID()}`;
    await prisma.$transaction([
      prisma.achievementDef.create({
        data: {
          id, title: out.title, description: out.description, icon: out.icon,
          rule: 'dynamic', isDynamic: true, enabled: true,
          ruleConfig: JSON.stringify({ ownerUserId: userId }),
        },
      }),
      prisma.userAchievement.create({ data: { userId, achievementId: id } }),
    ]);
    return { id, title: out.title, description: out.description, icon: out.icon };
  } catch (e) {
    console.error('[achievements] dynamic generation failed', e);
    return null;
  }
}

// Titles the user already has: all static enabled defs + the user's own (dynamic) ones.
async function currentTitles(prisma: PrismaClient, userId: string): Promise<string[]> {
  const [statics, mine] = await Promise.all([
    prisma.achievementDef.findMany({ where: { enabled: true, isDynamic: false }, select: { title: true } }),
    prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: { select: { title: true } } },
    }),
  ]);
  return [...statics.map((s) => s.title), ...mine.map((m) => m.achievement.title)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/dynamic-achievement.test.ts`
Expected: PASS (3 tests).

Also run `npm run typecheck` — expect exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/server/achievements/dynamic.ts tests/integration/dynamic-achievement.test.ts
git -c core.autocrlf=false commit -m "feat: generateDynamicAchievement (P1 Module 9, LLM-authored, owner-scoped)"
```

---

## Task 3: Route + list owner-scoping + tick scoping

**Files:**
- Create: `src/app/api/achievements/generate/route.ts`
- Modify: `src/app/api/achievements/route.ts`, `src/server/achievements/engine.ts`
- Test: `tests/integration/achievements-dynamic-route.test.ts`

Add the generation route, then make the achievements list owner-scope dynamic defs (so user B never sees user A's dynamic achievement), and stop the static tick from scanning dynamic defs.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/achievements-dynamic-route.test.ts
import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST } from '@/app/api/achievements/generate/route';
import { GET } from '@/app/api/achievements/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const UA = '__w8_ach_route_a__';
const UB = '__w8_ach_route_b__';

afterAll(async () => {
  for (const name of [UA, UB]) {
    const u = await prisma.user.findFirst({ where: { username: name } });
    if (u) {
      const mine = await prisma.userAchievement.findMany({ where: { userId: u.id } });
      await prisma.user.deleteMany({ where: { username: name } });
      await prisma.achievementDef.deleteMany({ where: { id: { in: mine.map((m) => m.achievementId) }, isDynamic: true } });
    }
  }
  await prisma.$disconnect();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const get = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });
const post = (uid: string) => new Request('http://x/', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

// Stub global fetch so the route's real OllamaClient.chatJson (POST /api/chat, format:json) returns a fixed JSON.
function stubChat(content: object) {
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/api/chat')) {
      return new Response(JSON.stringify({ message: { content: JSON.stringify(content) } }), { status: 200 });
    }
    throw new Error(`unexpected ${u}`);
  }));
}

describe('dynamic achievement route + isolation', () => {
  it('POST 401s without a cookie', async () => {
    expect((await POST(new Request('http://x/', { method: 'POST' }))).status).toBe(401);
  });

  it('POST generates an achievement that shows for the owner but NOT for another user', async () => {
    const a = await prisma.user.create({ data: { username: UA, password: 'pw' } });
    const b = await prisma.user.create({ data: { username: UB, password: 'pw' } });

    stubChat({ title: 'Daily Devotee', description: 'You keep showing up.', icon: '🔥' });
    const res = await POST(post(a.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.achievement.title).toBe('Daily Devotee');

    // owner A sees it (unlocked)
    const aList = await (await GET(get(a.id))).json();
    const aDyn = aList.find((x: { title: string }) => x.title === 'Daily Devotee');
    expect(aDyn).toBeTruthy();
    expect(aDyn.unlocked).toBe(true);

    // user B does NOT see A's dynamic achievement (isolation)
    const bList = await (await GET(get(b.id))).json();
    expect(bList.some((x: { title: string }) => x.title === 'Daily Devotee')).toBe(false);
    // B still sees the static defs
    expect(bList.some((x: { id: string }) => x.id === 'first_chat')).toBe(true);
  });

  it('POST returns { achievement: null } gracefully when the LLM is down', async () => {
    const a = await prisma.user.findFirstOrThrow({ where: { username: UA } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const res = await POST(post(a.id));
    expect(res.status).toBe(200);
    expect((await res.json()).achievement).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/achievements-dynamic-route.test.ts`
Expected: FAIL — cannot import `POST` from the non-existent generate route.

- [ ] **Step 3a: Implement the generate route**

```ts
// src/app/api/achievements/generate/route.ts
import { prisma } from '@/server/db/client';
import { OllamaClient } from '@/server/llm/ollama';
import { withUser, json } from '@/server/http/respond';
import { generateDynamicAchievement } from '@/server/achievements/dynamic';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const achievement = await generateDynamicAchievement(prisma, new OllamaClient(), userId);
    return json({ achievement });
  });
}
```

- [ ] **Step 3b: Owner-scope the achievements list**

Replace the body of `src/app/api/achievements/route.ts` with:

```ts
// src/app/api/achievements/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const [defs, unlocked] = await Promise.all([
      // Static defs are shown to everyone (locked or unlocked)...
      prisma.achievementDef.findMany({ where: { enabled: true, isDynamic: false }, orderBy: { id: 'asc' } }),
      prisma.userAchievement.findMany({ where: { userId }, include: { achievement: true } }),
    ]);
    const at = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));

    const staticList = defs.map((d) => ({
      id: d.id, title: d.title, description: d.description, icon: d.icon,
      unlocked: at.has(d.id), unlockedAt: at.get(d.id) ?? null,
    }));

    // ...dynamic defs are private: append only the caller's own unlocked ones.
    const dynamicList = unlocked
      .filter((u) => u.achievement.isDynamic)
      .map((u) => ({
        id: u.achievement.id, title: u.achievement.title, description: u.achievement.description,
        icon: u.achievement.icon, unlocked: true, unlockedAt: u.unlockedAt,
      }));

    return json([...staticList, ...dynamicList]);
  });
}
```

- [ ] **Step 3c: Keep the static tick static**

In `src/server/achievements/engine.ts`, narrow the `runAchievementTick` def query so it never scans dynamic defs. Change:

```ts
      prisma.achievementDef.findMany({ where: { enabled: true } }),
```

to:

```ts
      prisma.achievementDef.findMany({ where: { enabled: true, isDynamic: false } }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/achievements-dynamic-route.test.ts`
Expected: PASS (3 tests).

Also run `npm run test -- tests/integration/achievements.test.ts` (if it exists) to confirm the existing achievements list test still passes, and `npm run typecheck` — expect exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/achievements/generate/route.ts src/app/api/achievements/route.ts src/server/achievements/engine.ts tests/integration/achievements-dynamic-route.test.ts
git -c core.autocrlf=false commit -m "feat: POST /api/achievements/generate + owner-scoped dynamic achievements in list/tick"
```

---

## Task 4: Whole-suite verification + mark W8 done

**Files:**
- Modify: `docs/superpowers/plans/2026-05-25-backend-overall-plan.md` (W8 row)

- [ ] **Step 1: Confirm the dev DB is seeded, then run the full suite + typecheck**

Run: `npm run db:seed` (idempotent; ensures `flat_viewing` + Emma's role are present for the integration tests).
Run: `npm run test`
Expected: ALL tests pass (207 prior + the new W8 tests: 3 flat-viewing + 3 dynamic-service + 3 dynamic-route = 9 new → ~216). Note many stderr lines like `[achievements] dynamic generation failed` / `[correction] grammar check failed` are INTENTIONAL graceful-degradation logs from the failure-path tests — confirm the final tally is all-green.

Run: `npm run typecheck`
Expected: exit 0.

If anything fails, STOP and fix before continuing — do not mark W8 done with a red suite.

- [ ] **Step 2: Update the master plan W8 row**

In `docs/superpowers/plans/2026-05-25-backend-overall-plan.md`, change the `**W8**` row in the §3 phase table. Set the first cell to `**W8** ✅`, the plan-file cell to `` `2026-05-29-backend-w8-second-scenario-dynamic-achievements.md` ``, and replace the `Done when` cell with:

```
**DONE** — (1) 2nd scenario **Flat Viewing** (`emma` roleplaying `flat_host`; seed-only — the generic orchestrator triggers/accepts/runs it unchanged; `seed.ts` NPC upsert now refreshes `scenarioRoles`). (2) P1 Module 9 **Dynamic Achievements**: `generateDynamicAchievement` (LLM `chatJson` + strict Zod, graceful null, dedup vs existing titles) persists an owned `AchievementDef(isDynamic=true)` + `UserAchievement`; `POST /api/achievements/generate`; `GET /api/achievements` now lists static defs to all + appends only the caller's own unlocked dynamic ones (isolation), and `runAchievementTick` scans only `isDynamic:false`. All tests pass, typecheck clean. **Deferred:** Cross-NPC memory (M8), reflective companion, code-switching → later; periodic scheduler → on-demand for now.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-05-25-backend-overall-plan.md
git -c core.autocrlf=false commit -m "docs: mark W8 done in master plan"
```

---

## Self-Review (completed against spec §三 P1 / §五.5 / §七 M9 + W8 row)

**Spec coverage:**
- W8 "第 2 个 scenario 模板": Flat Viewing (Task 1) — a real 2nd `ScenarioTemplate` on a 2nd NPC (`emma`), proven by trigger + accept tests over the unchanged orchestrator. ✓
- §三 P1 / §七 Module 9 "AI-Generated Dynamic Achievements — 周期性 LLM 按行为生成个性化成就标题，严格 JSON，落 AchievementDef(isDynamic=true) + UserAchievement": `generateDynamicAchievement` (Task 2) does exactly this (strict Zod JSON via `chatJson`; persists both rows); `POST /api/achievements/generate` (Task 3) is the on-demand trigger (the local-demo form of "periodic" — no scheduler, documented). ✓
- W8 "stretch demo content": both features are demoable (a 2nd roleplay + a personalized earned badge). ✓

**Multi-user isolation (the #1 invariant):** dynamic defs are owned (`ruleConfig.ownerUserId`) and never broadcast — `GET /api/achievements` lists static defs to all but only the caller's own unlocked dynamic achievements; `runAchievementTick` excludes `isDynamic` defs; the route test asserts user B cannot see user A's dynamic achievement. ✓

**Type consistency:** `DynamicAchievementView` `{id,title,description,icon}` defined in Task 2, returned by the route in Task 3 inside `{ achievement }`. `generateDynamicAchievement(prisma, ollama: Pick<OllamaClient,'chatJson'>, userId)` defined in Task 2 and called identically in Task 3. The list item shape `{id,title,description,icon,unlocked,unlockedAt}` matches the pre-existing GET contract (static rows unchanged). `buildAchievementContext` reused from `engine.ts`. ✓

**Placeholder scan:** no TBD/TODO/"handle edge cases" — every code step shows full code. ✓

**Invariants enforced:** the new route goes through `withUser`; every query/write is `userId`-scoped; the generator never throws (null on failure) and dedups titles; the scenario half changes only seed data (no engine code); the seed `update` change is the minimal fix needed for Emma's role to land on re-seed. ✓
