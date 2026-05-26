# Backend W5 — Grammar Correction · Relationship Progression · Achievement Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the three cross-cutting reaction systems that run off every chat/scenario turn — Module 6 (Grammar Correction), Module 5 (Relationship & Progression for ordinary chat), and Module 7 (static Achievement Engine) — so corrections surface, relationships level up from chatting, and achievements unlock.

**Architecture:** Three small service modules under `src/server/{correction,relationship,achievements}/`, each a pure-ish function with a guarded wrapper, hung off the existing `streamChat` post-reply block and the scenario `end.ts` flow. No new SSE event names except the already-specced `correction`. No DB migration — every model (`Message.correction`, `RelationshipEvent`, `ActivityEvent`, `AchievementDef`, `UserAchievement`, `UserSettings.grammarCorrection`) already exists from W1.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma + SQLite, Zod, Vitest, Ollama HTTP API (mocked in tests), SSE.

**Spec:** `docs/superpowers/specs/2026-05-25-backend-roadmap-design.md` §七 (M5, M6, M7), §五.4 (manual correction), §五.8 (achievements), §六 (SSE `correction`), §十 (workflow A steps e–f, workflow B steps 13–14).

---

## Scope

**In scope (W5):**
- **Module 6 · Grammar Correction** — independent LLM JSON call `{hasIssue, fixed, noteZh, tag}`; gated by `UserSettings.grammarCorrection` (default on); persisted to `Message.correction`; emitted as the `correction` SSE event during chat; plus the manual `POST /api/threads/:npcId/messages/:msgId/correction` route.
- **Module 5 · Relationship & Progression (general per-message)** — `+1` relationship point per user chat message with a per-(user,npc)-per-day cap; recompute stage; record `RelationshipEvent` + `relationship_up` `ActivityEvent` on a cross-threshold stage-up. (The scenario-outcome path `applyScenarioOutcome` already shipped in W4 and is **unchanged** except for sharing the `stageForPoints` helper.)
- **Module 7 · Achievement Engine (static P0)** — rule evaluators for the 6 seeded achievements; an idempotent `runAchievementTick` worker invoked after a chat turn and after a scenario completes; `GET /api/achievements`.

**Deferred / explicitly NOT in W5 (SCOPE GUARD — do not build):**
- Input suggestion chips (`GET /threads/:npcId/suggestions`, `suggestions_update` SSE) → W6.
- Settings read/write routes (`GET/PUT /api/settings`) → W6. (W5 only *reads* `UserSettings.grammarCorrection`; it does not add a write route.)
- Journey aggregates, streak route, relationships route → W6.
- Dynamic / AI-generated achievements (`AchievementDef.isDynamic`) → P1.
- A new SSE event for casual-chat stage-ups — the spec's event list has none; W5 persists the stage-up to the DB only. Do **not** invent one.
- Reverse decay of relationship points → P1.

**SECURITY CONSTRAINT (unchanged, still in force):** auth is intentionally minimal — plaintext password, login = single `findFirst({ where:{ username, password } })`, no encryption/bcrypt/Auth.js. This is **local-demo-only, never deployed beyond localhost**. Auth is NOT a project contribution and must NOT be raised as a security finding in any review of this branch.

---

## Conventions (match the existing codebase)

- Services live in `src/server/<module>/`; route handlers in `src/app/api/.../route.ts` with `export const dynamic = 'force-dynamic';` and the `withUser` / `requireUser` helpers from `@/server/http/respond`.
- **Multi-user isolation (#1 principle):** every load that can be reached by id is scoped — `findFirst({ where: { id, userId } })` (or via a scoped relation), never a bare `findUnique({ where: { id } })` for user-owned rows.
- **Stream safety:** anything hung off `streamChat`/scenario generators must be guarded — an LLM or DB failure logs and degrades; it must never throw out of the generator or skip `done`.
- JSON columns are `String`; parse with a try/catch and a safe fallback (corrupt rows must not crash a turn).
- Tests: unit tests (`tests/unit/`) need no DB/Ollama (pure functions, plain objects); integration tests (`tests/integration/`) hit the real SQLite dev db with a **mocked** Ollama client. Follow TDD: write the failing test, watch it fail, implement, watch it pass, commit.
- **Commit discipline (SCOPE GUARD):** `git status --short` first; `git add` only the task's named files; never `git add -A`/`.`. `.claude/settings.local.json` stays dirty (harness noise); `dev.db*` are gitignored. On Windows, if a commit is blocked by autocrlf, retry prefixed with `git -c core.autocrlf=false`.
- Branch: `backend/w5-correction-progression-achievements`.

---

## File Structure

**Create:**
```
src/server/relationship/stage.ts            # shared stageForPoints + STAGE constants (single source)
src/server/relationship/progression.ts      # applyMessageProgression (Module 5, per-message)
src/server/correction/grammar.ts            # CorrectionSchema + correctGrammar (Module 6)
src/server/achievements/rules.ts            # GRADE_RANK + pure rule evaluators (Module 7)
src/server/achievements/engine.ts           # buildAchievementContext + runAchievementTick (Module 7)
src/app/api/threads/[npcId]/messages/[msgId]/correction/route.ts   # manual correction (POST)
src/app/api/achievements/route.ts           # GET achievements

tests/unit/relationship-stage.test.ts
tests/unit/correction-grammar… (none — correctGrammar needs a mocked client → integration)
tests/unit/achievement-rules.test.ts
tests/integration/relationship-progression.test.ts
tests/integration/correction-grammar.test.ts
tests/integration/stream-chat-correction.test.ts
tests/integration/correction-route.test.ts
tests/integration/achievement-engine.test.ts
tests/integration/achievements-route.test.ts
```

**Modify:**
- `src/server/scenario/relationship.ts` — import `stageForPoints` from the new shared module and re-export it (delete the local copy); `gradePoints` and `applyScenarioOutcome` stay.
- `src/server/chat/streamChat.ts` — replace the inline relationship `update` block with `applyMessageProgression`; add gated grammar correction (emits `correction`); add `runAchievementTick`.
- `src/server/scenario/end.ts` — add `runAchievementTick` after the `scenario_completed` activity event.

**Responsibilities:** each new file is one concern — `stage.ts` = points→stage mapping; `progression.ts` = per-message relationship mutation; `grammar.ts` = one LLM correction call; `rules.ts` = pure boolean rule logic; `engine.ts` = DB snapshot + unlock writes. The two route files are thin adapters.

---

## Task 1: Shared `stageForPoints` (DRY the stage mapping)

**Files:**
- Create: `src/server/relationship/stage.ts`
- Modify: `src/server/scenario/relationship.ts`
- Test: `tests/unit/relationship-stage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/relationship-stage.test.ts
import { describe, it, expect } from 'vitest';
import { stageForPoints } from '@/server/relationship/stage';

describe('stageForPoints', () => {
  it('maps hidden points to a stage + stageValue at the spec thresholds', () => {
    expect(stageForPoints(0)).toEqual({ stage: 'acquaintance', stageValue: 1 });
    expect(stageForPoints(29)).toEqual({ stage: 'acquaintance', stageValue: 1 });
    expect(stageForPoints(30)).toEqual({ stage: 'friend', stageValue: 2 });
    expect(stageForPoints(69)).toEqual({ stage: 'friend', stageValue: 2 });
    expect(stageForPoints(70)).toEqual({ stage: 'close', stageValue: 3 });
    expect(stageForPoints(100)).toEqual({ stage: 'close', stageValue: 3 });
  });
});
```

- [ ] **Step 2: Run it; expect FAIL** — `npx vitest run tests/unit/relationship-stage.test.ts` → fails (module not found).

- [ ] **Step 3: Create the shared module**

```ts
// src/server/relationship/stage.ts
// Single source of truth for the hidden-points → relationship-stage mapping (spec §七 M5).
// Thresholds: friend at 30, close at 70.
export interface StageInfo { stage: string; stageValue: number }

export function stageForPoints(points: number): StageInfo {
  if (points >= 70) return { stage: 'close', stageValue: 3 };
  if (points >= 30) return { stage: 'friend', stageValue: 2 };
  return { stage: 'acquaintance', stageValue: 1 };
}
```

- [ ] **Step 4: Refactor `scenario/relationship.ts` to use it** — replace the local `stageForPoints` with an import + re-export so existing importers (`tests/integration/scenario-relationship.test.ts`) keep working:

```ts
// src/server/scenario/relationship.ts
import type { PrismaClient } from '@prisma/client';
import { stageForPoints } from '@/server/relationship/stage';

export { stageForPoints };

const GRADE_POINTS: Record<string, number> = {
  'A+': 15, A: 12, 'A-': 10, 'B+': 9, B: 8, 'B-': 6, C: 3, '—': 0,
};

export function gradePoints(grade: string): number {
  return GRADE_POINTS[grade] ?? 0;
}

// Applies a completed scenario's grade to the relationship: add points, recompute stage,
// record a RelationshipEvent on a stage-up. Returns the stage change for the SSE payload, or null.
export async function applyScenarioOutcome(
  prisma: PrismaClient,
  userId: string,
  npcId: string,
  grade: string,
  scenarioTitle: string,
): Promise<{ from: string; to: string } | null> {
  const rel = await prisma.relationship.upsert({
    where: { userId_npcId: { userId, npcId } },
    create: { userId, npcId },
    update: {},
  });

  const points = rel.relationshipPoints + gradePoints(grade);
  const next = stageForPoints(points);
  const changed = next.stageValue > rel.stageValue;

  await prisma.relationship.update({
    where: { id: rel.id },
    data: {
      relationshipPoints: points,
      stage: next.stage,
      stageValue: next.stageValue,
      scenarioCount: { increment: 1 },
      lastInteractionAt: new Date(),
    },
  });

  if (!changed) return null;

  await prisma.relationshipEvent.create({
    data: { relationshipId: rel.id, fromStage: rel.stage, toStage: next.stage, reason: `scenario_completed:${scenarioTitle}` },
  });
  return { from: rel.stage, to: next.stage };
}
```

- [ ] **Step 5: Run both suites; expect PASS** — `npx vitest run tests/unit/relationship-stage.test.ts tests/integration/scenario-relationship.test.ts` → all pass (the scenario test imports `stageForPoints`/`gradePoints` from `@/server/scenario/relationship`, which still re-exports them).

- [ ] **Step 6: Commit**

```bash
git add src/server/relationship/stage.ts src/server/scenario/relationship.ts tests/unit/relationship-stage.test.ts
git -c core.autocrlf=false commit -m "refactor: extract shared stageForPoints into relationship/stage"
```

---

## Task 2: `applyMessageProgression` (Module 5, per-message)

**Files:**
- Create: `src/server/relationship/progression.ts`
- Test: `tests/integration/relationship-progression.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/relationship-progression.test.ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyMessageProgression, DAILY_POINT_CAP } from '@/server/relationship/progression';

const prisma = new PrismaClient();
const U = '__w5_progression_user__';

async function reset() {
  await prisma.user.deleteMany({ where: { username: U } });
}
beforeEach(reset);
afterAll(async () => { await reset(); await prisma.$disconnect(); });

// streamChat records the 'message_sent' ActivityEvent *before* calling progression, so the
// helper sees the current message in today's count. We mirror that here.
async function sendOnce(userId: string, npcId: string, now?: Date) {
  await prisma.activityEvent.create({ data: { userId, type: 'message_sent', payload: JSON.stringify({ npcId }) } });
  return applyMessageProgression(prisma, userId, npcId, now);
}

describe('applyMessageProgression', () => {
  it('awards +1, bumps conversationCount, and stamps lastInteractionAt', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const r = await sendOnce(user.id, 'lily');
    expect(r.pointsAwarded).toBe(1);
    expect(r.stageChange).toBeNull();
    const rel = await prisma.relationship.findUniqueOrThrow({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel.relationshipPoints).toBe(1);
    expect(rel.conversationCount).toBe(1);
    expect(rel.lastInteractionAt).not.toBeNull();
  });

  it('records a RelationshipEvent + relationship_up event when crossing a stage threshold', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'acquaintance', stageValue: 1, relationshipPoints: 29 } });
    const r = await sendOnce(user.id, 'lily');
    expect(r.stageChange).toEqual({ from: 'acquaintance', to: 'friend' });
    const rel = await prisma.relationship.findUniqueOrThrow({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel.stage).toBe('friend');
    expect(rel.relationshipPoints).toBe(30);
    const evt = await prisma.relationshipEvent.findFirst({ where: { relationshipId: rel.id } });
    expect(evt?.toStage).toBe('friend');
    expect(evt?.reason).toBe('msg_count_threshold');
    expect(await prisma.activityEvent.count({ where: { userId: user.id, type: 'relationship_up' } })).toBe(1);
  });

  it('caps daily points: the (CAP+1)-th message of the day awards 0', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    let last = { pointsAwarded: -1 } as { pointsAwarded: number };
    for (let i = 0; i < DAILY_POINT_CAP + 1; i++) last = await sendOnce(user.id, 'lily');
    expect(last.pointsAwarded).toBe(0);
    const rel = await prisma.relationship.findUniqueOrThrow({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel.relationshipPoints).toBe(DAILY_POINT_CAP);
    // conversationCount still increments on every message, even past the cap
    expect(rel.conversationCount).toBe(DAILY_POINT_CAP + 1);
  });

  it('scopes the daily count per npc — a different npc still earns its own point', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    for (let i = 0; i < DAILY_POINT_CAP + 1; i++) await sendOnce(user.id, 'lily');
    const r = await sendOnce(user.id, 'chen');
    expect(r.pointsAwarded).toBe(1);
  });
});
```

- [ ] **Step 2: Run it; expect FAIL** — `npx vitest run tests/integration/relationship-progression.test.ts` → fails (module not found).

- [ ] **Step 3: Implement**

```ts
// src/server/relationship/progression.ts
import type { PrismaClient } from '@prisma/client';
import { stageForPoints } from './stage';

export const MESSAGE_POINT = 1;
export const DAILY_POINT_CAP = 10; // max message-points per (user, npc) per calendar day

function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface ProgressionResult {
  pointsAwarded: number;
  relationshipPoints: number;
  stageChange: { from: string; to: string } | null;
}

// Module 5 (general per-message): one user chat message → +1 relationship point (daily-capped
// per npc), conversationCount++, lastInteractionAt now; recompute stage and, on a cross-threshold
// stage-up, record a RelationshipEvent + a 'relationship_up' ActivityEvent.
// The daily count is read from today's 'message_sent' ActivityEvents for this npc — streamChat
// records that event *before* calling this, so the current message is included in the count.
export async function applyMessageProgression(
  prisma: PrismaClient,
  userId: string,
  npcId: string,
  now: Date = new Date(),
): Promise<ProgressionResult> {
  const rel = await prisma.relationship.upsert({
    where: { userId_npcId: { userId, npcId } },
    create: { userId, npcId },
    update: {},
  });

  const todays = await prisma.activityEvent.findMany({
    where: { userId, type: 'message_sent', createdAt: { gte: startOfDay(now) } },
  });
  const countForNpc = todays.filter((e) => {
    try { return (JSON.parse(e.payload) as { npcId?: string }).npcId === npcId; } catch { return false; }
  }).length;

  const pointsAwarded = countForNpc <= DAILY_POINT_CAP ? MESSAGE_POINT : 0;
  const points = rel.relationshipPoints + pointsAwarded;
  const next = stageForPoints(points);
  const changed = next.stageValue > rel.stageValue;

  await prisma.relationship.update({
    where: { id: rel.id },
    data: {
      relationshipPoints: points,
      stage: next.stage,
      stageValue: next.stageValue,
      conversationCount: { increment: 1 },
      lastInteractionAt: now,
    },
  });

  if (!changed) return { pointsAwarded, relationshipPoints: points, stageChange: null };

  await prisma.relationshipEvent.create({
    data: { relationshipId: rel.id, fromStage: rel.stage, toStage: next.stage, reason: 'msg_count_threshold' },
  });
  await prisma.activityEvent.create({
    data: { userId, type: 'relationship_up', payload: JSON.stringify({ npcId, from: rel.stage, to: next.stage }) },
  });
  return { pointsAwarded, relationshipPoints: points, stageChange: { from: rel.stage, to: next.stage } };
}
```

- [ ] **Step 4: Run it; expect PASS** — `npx vitest run tests/integration/relationship-progression.test.ts` → 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/relationship/progression.ts tests/integration/relationship-progression.test.ts
git -c core.autocrlf=false commit -m "feat: per-message relationship progression with daily cap + stage-up events"
```

---

## Task 3: Wire progression into `streamChat`

**Files:**
- Modify: `src/server/chat/streamChat.ts`
- Test: `tests/integration/stream-chat.test.ts` (existing — must still pass) + add a stage-up case

- [ ] **Step 1: Add a failing integration test for a chat-driven stage-up**

Append to `tests/integration/stream-chat.test.ts` a new `it` inside the existing `describe('streamChat', ...)`:

```ts
  it('levels up the relationship from a casual chat when points cross a threshold', async () => {
    const U3 = U + '_levelup';
    await prisma.user.deleteMany({ where: { username: U3 } });
    const user = await prisma.user.create({ data: { username: U3, password: 'pw' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'acquaintance', stageValue: 1, relationshipPoints: 29 } });

    const fetchImpl = vi.fn().mockResolvedValue(
      ndjsonResponse([JSON.stringify({ message: { content: 'hey!' }, done: true })]),
    );
    const ollama = new OllamaClient({ fetchImpl });
    for await (const _e of streamChat({ prisma, ollama, userId: user.id, npcId: 'lily', text: 'good morning' })) void _e;

    const rel = await prisma.relationship.findUniqueOrThrow({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel.relationshipPoints).toBe(30);
    expect(rel.stage).toBe('friend');
    expect(await prisma.relationshipEvent.count({ where: { relationshipId: rel.id, toStage: 'friend' } })).toBe(1);
    await prisma.user.delete({ where: { id: user.id } });
  });
```

- [ ] **Step 2: Run it; expect FAIL** — `npx vitest run tests/integration/stream-chat.test.ts` → the new case fails (points become 30 but stage stays `acquaintance`, no event), because `streamChat` still uses the flat `+1` update.

- [ ] **Step 3: Rewire `streamChat`** — add the import and replace the post-reply relationship block. Change the import group near the top:

```ts
import { maybeOfferScenario } from '@/server/scenario/offer';
import { applyMessageProgression } from '@/server/relationship/progression';
```

Then replace this existing block:

```ts
  await prisma.thread.update({ where: { id: thread.id }, data: { lastMsgAt: npcMsg.createdAt } });
  await prisma.relationship.update({
    where: { id: rel.id },
    data: {
      conversationCount: { increment: 1 },
      relationshipPoints: { increment: 1 },
      lastInteractionAt: new Date(),
    },
  });
  await prisma.activityEvent.create({
    data: { userId, type: 'message_sent', payload: JSON.stringify({ npcId }) },
  });
```

with (note: the `message_sent` event is now created **before** progression, so the daily-cap count includes this message):

```ts
  await prisma.thread.update({ where: { id: thread.id }, data: { lastMsgAt: npcMsg.createdAt } });
  await prisma.activityEvent.create({
    data: { userId, type: 'message_sent', payload: JSON.stringify({ npcId }) },
  });
  await applyMessageProgression(prisma, userId, npcId);
```

(The early `const rel = await prisma.relationship.upsert(...)` near the top stays — it is still read for the prompt's `relationshipStage`. `applyMessageProgression` re-reads/updates the row itself.)

- [ ] **Step 4: Run the full stream-chat suite; expect PASS** — `npx vitest run tests/integration/stream-chat.test.ts`. The original test 1 still asserts `relationshipPoints === 1` / `conversationCount === 1` / `message_sent === 1` (first message of the day → +1), and the new case asserts the 29→30 stage-up.

- [ ] **Step 5: Guard the scenario e2e** — `npx vitest run tests/integration/scenario-e2e.test.ts`. Still expects `relationshipPoints === 78` (65 + 1 casual chat point + 12 scenario A) and `relationshipChange friend→close`. Confirm PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/chat/streamChat.ts tests/integration/stream-chat.test.ts
git -c core.autocrlf=false commit -m "feat: drive per-message relationship progression from streamChat"
```

---

## Task 4: `correctGrammar` (Module 6 core)

**Files:**
- Create: `src/server/correction/grammar.ts`
- Test: `tests/integration/correction-grammar.test.ts`

- [ ] **Step 1: Write the failing test** (uses a stub Ollama with just `chatJson`, so it is fast — placed in `tests/integration/` to match the project's "anything taking a client is integration" convention):

```ts
// tests/integration/correction-grammar.test.ts
import { describe, it, expect, vi } from 'vitest';
import { correctGrammar } from '@/server/correction/grammar';

describe('correctGrammar', () => {
  it('returns the correction when the model flags an issue', async () => {
    const ollama = { chatJson: vi.fn().mockResolvedValue({ hasIssue: true, fixed: 'I went to the store.', noteZh: '过去式应用 went。', tag: 'tense' }) };
    const r = await correctGrammar({ ollama, userText: 'I go to the store yesterday.' });
    expect(r).toEqual({ hasIssue: true, fixed: 'I went to the store.', noteZh: '过去式应用 went。', tag: 'tense' });
  });

  it('returns null when there is no issue', async () => {
    const ollama = { chatJson: vi.fn().mockResolvedValue({ hasIssue: false, fixed: '', noteZh: '', tag: '' }) };
    expect(await correctGrammar({ ollama, userText: 'Hello, how are you?' })).toBeNull();
  });

  it('returns null (never throws) when the model call fails', async () => {
    const ollama = { chatJson: vi.fn().mockRejectedValue(new Error('LLM down')) };
    expect(await correctGrammar({ ollama, userText: 'whatever' })).toBeNull();
  });

  it('treats hasIssue:true with an empty fix as no correction', async () => {
    const ollama = { chatJson: vi.fn().mockResolvedValue({ hasIssue: true, fixed: '   ', noteZh: '', tag: '' }) };
    expect(await correctGrammar({ ollama, userText: 'ok' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it; expect FAIL** — `npx vitest run tests/integration/correction-grammar.test.ts` → module not found.

- [ ] **Step 3: Implement**

```ts
// src/server/correction/grammar.ts
import { z } from 'zod';
import type { OllamaClient, ChatMessage } from '@/server/llm/ollama';

export const CorrectionSchema = z.object({
  hasIssue: z.boolean(),
  fixed: z.string().default(''),
  noteZh: z.string().default(''),
  tag: z.string().default(''),
});
export type Correction = z.infer<typeof CorrectionSchema>;

const SYSTEM_PROMPT =
  'You are an English writing coach for a Chinese-speaking learner. ' +
  "Given the learner's latest message (and the prior NPC line for context), decide whether it has a " +
  'grammar, word-choice, tense, article, or naturalness issue. ' +
  'Return JSON {"hasIssue": boolean, "fixed": <the corrected, natural English sentence, or "" if none>, ' +
  '"noteZh": <a one-sentence explanation IN CHINESE of the fix, or "">, ' +
  '"tag": <short category such as "grammar","word choice","tense","article", or "">}. ' +
  'If the message is already natural, return {"hasIssue": false, "fixed": "", "noteZh": "", "tag": ""}. ' +
  'No prose outside the JSON.';

export interface CorrectionDeps {
  ollama: Pick<OllamaClient, 'chatJson'>;
  userText: string;
  npcPrev?: string;
}

// Module 6: one independent LLM JSON call. Returns the correction only when the model flags a real,
// non-empty fix; returns null on "no issue" or any failure. Never throws — correction is best-effort.
export async function correctGrammar(deps: CorrectionDeps): Promise<Correction | null> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: (deps.npcPrev ? `NPC said: ${deps.npcPrev}\n\n` : '') + `Learner said: ${deps.userText}` },
  ];
  try {
    const out = await deps.ollama.chatJson(messages, CorrectionSchema);
    if (!out.hasIssue || !out.fixed.trim()) return null;
    return out;
  } catch (e) {
    console.error('[correction] grammar check failed', e);
    return null;
  }
}
```

- [ ] **Step 4: Run it; expect PASS** — `npx vitest run tests/integration/correction-grammar.test.ts` → 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/correction/grammar.ts tests/integration/correction-grammar.test.ts
git -c core.autocrlf=false commit -m "feat: grammar correction LLM call (Module 6 core)"
```

---

## Task 5: Wire grammar correction into `streamChat`

**Files:**
- Modify: `src/server/chat/streamChat.ts`
- Test: `tests/integration/stream-chat-correction.test.ts`

- [ ] **Step 1: Write the failing test** — drive `streamChat` with a fetch mock that streams the NPC reply but returns a correction JSON for the non-stream `chatJson` call. The mock keys off the request body's `stream` flag (same trick the e2e uses). Because the chat pipeline also fires `factExtract` (a `chatJson` call), the mock returns a correction-shaped object only for the *first* non-stream call and falls back to `{facts:[]}` afterwards so fact extraction still parses:

```ts
// tests/integration/stream-chat-correction.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OllamaClient } from '@/server/llm/ollama';
import { streamChat } from '@/server/chat/streamChat';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const U = '__w5_correction_stream_user__';

afterAll(async () => { await prisma.user.deleteMany({ where: { username: U } }); await prisma.$disconnect(); });

function ndjson(lines: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const l of lines) c.enqueue(enc.encode(l + '\n')); c.close(); } });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe('streamChat grammar correction', () => {
  it('emits a correction event and persists it onto the user message', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });

    let jsonCalls = 0;
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      if (b.stream === true) return ndjson([JSON.stringify({ message: { content: 'no worries!' }, done: true })]);
      jsonCalls++;
      const content = jsonCalls === 1
        ? JSON.stringify({ hasIssue: true, fixed: 'I went there yesterday.', noteZh: '用过去式 went。', tag: 'tense' })
        : JSON.stringify({ facts: [] });
      return { ok: true, status: 200, json: async () => ({ message: { content } }) } as unknown as Response;
    });
    const ollama = new OllamaClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const events: SseEvent[] = [];
    for await (const e of streamChat({ prisma, ollama, userId: user.id, npcId: 'lily', text: 'I go there yesterday.' })) events.push(e);

    const corr = events.find((e) => e.event === 'correction');
    expect(corr).toBeTruthy();
    const data = corr!.data as { targetMessageId: string; correction: { fixed: string; tag: string } };
    expect(data.correction.fixed).toBe('I went there yesterday.');
    expect(data.correction.tag).toBe('tense');

    const userMsg = await prisma.message.findUniqueOrThrow({ where: { id: data.targetMessageId } });
    expect(userMsg.role).toBe('user');
    expect(JSON.parse(userMsg.correction!).fixed).toBe('I went there yesterday.');
  });

  it('skips correction when the user disabled it in settings', async () => {
    const U2 = U + '_off';
    await prisma.user.deleteMany({ where: { username: U2 } });
    const user = await prisma.user.create({ data: { username: U2, password: 'pw' } });
    await prisma.userSettings.create({ data: { userId: user.id, grammarCorrection: false } });

    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      if (b.stream === true) return ndjson([JSON.stringify({ message: { content: 'ok' }, done: true })]);
      return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ facts: [] }) } }) } as unknown as Response;
    });
    const ollama = new OllamaClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const events: SseEvent[] = [];
    for await (const e of streamChat({ prisma, ollama, userId: user.id, npcId: 'lily', text: 'I go there yesterday.' })) events.push(e);
    expect(events.find((e) => e.event === 'correction')).toBeUndefined();
    await prisma.user.delete({ where: { id: user.id } });
  });
});
```

- [ ] **Step 2: Run it; expect FAIL** — `npx vitest run tests/integration/stream-chat-correction.test.ts` → no `correction` event yet.

- [ ] **Step 3: Wire into `streamChat`** — add the import:

```ts
import { correctGrammar } from '@/server/correction/grammar';
```

Insert this block **after** `await applyMessageProgression(prisma, userId, npcId);` and **before** `await runPostTurnMemory(...)`:

```ts
  // Grammar correction — gated by settings (default on), guarded. Targets the user's message.
  try {
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (settings?.grammarCorrection !== false) {
      const correction = await correctGrammar({ ollama, userText: text, npcPrev: full });
      if (correction) {
        const payload = { fixed: correction.fixed, noteZh: correction.noteZh, tag: correction.tag };
        await prisma.message.update({ where: { id: userMsg.id }, data: { correction: JSON.stringify(payload) } });
        yield { event: 'correction', data: { targetMessageId: userMsg.id, correction: payload } };
      }
    }
  } catch (e) {
    console.error('[correction] failed', e);
  }
```

(`settings?.grammarCorrection !== false` → runs when there is no settings row, matching the schema default `true`.)

- [ ] **Step 4: Run it; expect PASS** — `npx vitest run tests/integration/stream-chat-correction.test.ts` → 2 pass.

- [ ] **Step 5: Re-run the existing chat/scenario suites; expect PASS** — `npx vitest run tests/integration/stream-chat.test.ts tests/integration/stream-chat-memory.test.ts tests/integration/stream-chat-scenario.test.ts tests/integration/scenario-e2e.test.ts`. In those, the correction `chatJson` call hits a mock that does not return a valid correction (or has no `.json`), so `correctGrammar` returns null → no `correction` event, no behavior change.

- [ ] **Step 6: Commit**

```bash
git add src/server/chat/streamChat.ts tests/integration/stream-chat-correction.test.ts
git -c core.autocrlf=false commit -m "feat: emit + persist grammar correction in streamChat (gated by settings)"
```

---

## Task 6: Manual correction route

**Files:**
- Create: `src/app/api/threads/[npcId]/messages/[msgId]/correction/route.ts`
- Test: `tests/integration/correction-route.test.ts`

- [ ] **Step 1: Write the failing test** — exercise the handler directly (like other route tests), with the auth cookie helper:

```ts
// tests/integration/correction-route.test.ts
import { describe, it, expect, afterAll, vi, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w5_correction_route_user__';

let ollamaMock: { chatJson: ReturnType<typeof vi.fn> };
vi.mock('@/server/llm/ollama', async (orig) => {
  const actual = await orig<typeof import('@/server/llm/ollama')>();
  return { ...actual, OllamaClient: vi.fn().mockImplementation(() => ollamaMock) };
});

let POST: typeof import('@/app/api/threads/[npcId]/messages/[msgId]/correction/route').POST;
beforeAll(async () => { ({ POST } = await import('@/app/api/threads/[npcId]/messages/[msgId]/correction/route')); });
afterAll(async () => { await prisma.user.deleteMany({ where: { username: U } }); await prisma.$disconnect(); });

function reqFor(userId: string) {
  return new Request('http://t/api/threads/lily/messages/X/correction', {
    method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${userId}` },
  });
}

describe('POST manual correction', () => {
  it('corrects the user message and persists it', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    const msg = await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'I go there yesterday.' } });

    ollamaMock = { chatJson: vi.fn().mockResolvedValue({ hasIssue: true, fixed: 'I went there yesterday.', noteZh: '用 went。', tag: 'tense' }) };
    const res = await POST(reqFor(user.id), { params: { npcId: 'lily', msgId: msg.id } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.correction.fixed).toBe('I went there yesterday.');
    const reloaded = await prisma.message.findUniqueOrThrow({ where: { id: msg.id } });
    expect(JSON.parse(reloaded.correction!).tag).toBe('tense');
  });

  it('404s on a message that is not the caller\'s', async () => {
    const me = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const other = await prisma.user.create({ data: { username: U + '_other', password: 'pw' } });
    const oThread = await prisma.thread.create({ data: { userId: other.id, npcId: 'lily' } });
    const oMsg = await prisma.message.create({ data: { threadId: oThread.id, userId: other.id, role: 'user', text: 'hi' } });
    ollamaMock = { chatJson: vi.fn() };
    const res = await POST(reqFor(me.id), { params: { npcId: 'lily', msgId: oMsg.id } });
    expect(res.status).toBe(404);
    expect(ollamaMock.chatJson).not.toHaveBeenCalled();
    await prisma.user.delete({ where: { id: other.id } });
  });

  it('returns { correction: null } when the model finds no issue', async () => {
    const me = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const thread = await prisma.thread.findFirstOrThrow({ where: { userId: me.id, npcId: 'lily' } });
    const msg = await prisma.message.create({ data: { threadId: thread.id, userId: me.id, role: 'user', text: 'Hello there.' } });
    ollamaMock = { chatJson: vi.fn().mockResolvedValue({ hasIssue: false, fixed: '', noteZh: '', tag: '' }) };
    const res = await POST(reqFor(me.id), { params: { npcId: 'lily', msgId: msg.id } });
    expect(res.status).toBe(200);
    expect((await res.json()).correction).toBeNull();
  });
});
```

- [ ] **Step 2: Run it; expect FAIL** — `npx vitest run tests/integration/correction-route.test.ts` → route module not found.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/threads/[npcId]/messages/[msgId]/correction/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { OllamaClient } from '@/server/llm/ollama';
import { correctGrammar } from '@/server/correction/grammar';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: { npcId: string; msgId: string } },
): Promise<Response> {
  return withUser(req, async (userId) => {
    // user-scoped: a foreign message id must not be correctable. User messages carry userId;
    // restricting to userId also rules out correcting an NPC line (those have userId = null).
    const msg = await prisma.message.findFirst({
      where: { id: params.msgId, userId, thread: { npcId: params.npcId } },
    });
    if (!msg) return errorJson(404, 'NOT_FOUND', 'Message not found');

    const correction = await correctGrammar({ ollama: new OllamaClient(), userText: msg.text });
    if (!correction) return json({ correction: null });

    const payload = { fixed: correction.fixed, noteZh: correction.noteZh, tag: correction.tag };
    await prisma.message.update({ where: { id: msg.id }, data: { correction: JSON.stringify(payload) } });
    return json({ correction: payload });
  });
}
```

- [ ] **Step 4: Run it; expect PASS** — `npx vitest run tests/integration/correction-route.test.ts` → 3 pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/threads/[npcId]/messages/[msgId]/correction/route.ts" tests/integration/correction-route.test.ts
git -c core.autocrlf=false commit -m "feat: manual grammar-correction route (POST)"
```

---

## Task 7: Achievement rule evaluators (Module 7 pure core)

**Files:**
- Create: `src/server/achievements/rules.ts`
- Test: `tests/unit/achievement-rules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/achievement-rules.test.ts
import { describe, it, expect } from 'vitest';
import { isUnlocked, gradeAtLeast, type AchievementContext } from '@/server/achievements/rules';

const base: AchievementContext = {
  messageSentCount: 0, completedScenarioCount: 0, bestGrade: '—',
  npcsAtFriendPlus: 0, totalNpcs: 3, hasBilingualThread: false, streakDays: 0,
};

describe('gradeAtLeast', () => {
  it('ranks grades so B+ ≥ B but B- < B', () => {
    expect(gradeAtLeast('A', 'B')).toBe(true);
    expect(gradeAtLeast('B+', 'B')).toBe(true);
    expect(gradeAtLeast('B', 'B')).toBe(true);
    expect(gradeAtLeast('B-', 'B')).toBe(false);
    expect(gradeAtLeast('—', 'B')).toBe(false);
  });
});

describe('isUnlocked', () => {
  it('first_chat needs ≥1 sent message', () => {
    expect(isUnlocked('first_chat', base, {})).toBe(false);
    expect(isUnlocked('first_chat', { ...base, messageSentCount: 1 }, {})).toBe(true);
  });
  it('all_npcs_friend needs every npc at friend+', () => {
    expect(isUnlocked('all_npcs_friend', { ...base, npcsAtFriendPlus: 2 }, {})).toBe(false);
    expect(isUnlocked('all_npcs_friend', { ...base, npcsAtFriendPlus: 3 }, {})).toBe(true);
  });
  it('first_scenario_completed needs ≥1 completed', () => {
    expect(isUnlocked('first_scenario_completed', { ...base, completedScenarioCount: 1 }, {})).toBe(true);
  });
  it('scenario_grade_min honors the configured minGrade and requires a completed scenario', () => {
    expect(isUnlocked('scenario_grade_min', { ...base, bestGrade: 'A' }, { minGrade: 'B' })).toBe(false); // none completed
    expect(isUnlocked('scenario_grade_min', { ...base, completedScenarioCount: 1, bestGrade: 'A' }, { minGrade: 'B' })).toBe(true);
    expect(isUnlocked('scenario_grade_min', { ...base, completedScenarioCount: 1, bestGrade: 'C' }, { minGrade: 'B' })).toBe(false);
  });
  it('bilingual_message reads the context flag', () => {
    expect(isUnlocked('bilingual_message', { ...base, hasBilingualThread: true }, {})).toBe(true);
  });
  it('streak_days honors config.days', () => {
    expect(isUnlocked('streak_days', { ...base, streakDays: 6 }, { days: 7 })).toBe(false);
    expect(isUnlocked('streak_days', { ...base, streakDays: 7 }, { days: 7 })).toBe(true);
  });
  it('unknown rule → false', () => {
    expect(isUnlocked('nope', base, {})).toBe(false);
  });
});
```

- [ ] **Step 2: Run it; expect FAIL** — `npx vitest run tests/unit/achievement-rules.test.ts`.

- [ ] **Step 3: Implement**

```ts
// src/server/achievements/rules.ts
// Module 7 (static P0): pure rule evaluators over a precomputed snapshot. The engine builds the
// AchievementContext from the DB; these functions stay pure so they unit-test without a DB.

export const GRADE_RANK: Record<string, number> = {
  'A+': 8, A: 7, 'A-': 6, 'B+': 5, B: 4, 'B-': 3, C: 2, '—': 0,
};

export function gradeAtLeast(grade: string, min: string): boolean {
  return (GRADE_RANK[grade] ?? 0) >= (GRADE_RANK[min] ?? 0);
}

export interface AchievementContext {
  messageSentCount: number;       // total 'message_sent' activity events
  completedScenarioCount: number; // scenarios with status 'completed'
  bestGrade: string;              // highest grade across completed scenarios ('—' if none)
  npcsAtFriendPlus: number;       // distinct npcs at stageValue >= 2
  totalNpcs: number;              // seeded npc count
  hasBilingualThread: boolean;    // some thread mixes zh + en in the user's own messages
  streakDays: number;             // consecutive-day chat streak
}

export type RuleFn = (ctx: AchievementContext, config: Record<string, unknown>) => boolean;

export const RULES: Record<string, RuleFn> = {
  first_chat: (c) => c.messageSentCount >= 1,
  all_npcs_friend: (c) => c.totalNpcs > 0 && c.npcsAtFriendPlus >= c.totalNpcs,
  first_scenario_completed: (c) => c.completedScenarioCount >= 1,
  scenario_grade_min: (c, cfg) => c.completedScenarioCount >= 1 && gradeAtLeast(c.bestGrade, String(cfg.minGrade ?? 'B')),
  bilingual_message: (c) => c.hasBilingualThread,
  streak_days: (c, cfg) => c.streakDays >= Number(cfg.days ?? 7),
};

export function isUnlocked(rule: string, ctx: AchievementContext, config: Record<string, unknown>): boolean {
  const fn = RULES[rule];
  return fn ? fn(ctx, config) : false;
}
```

- [ ] **Step 4: Run it; expect PASS** — `npx vitest run tests/unit/achievement-rules.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/server/achievements/rules.ts tests/unit/achievement-rules.test.ts
git -c core.autocrlf=false commit -m "feat: achievement rule evaluators (Module 7 pure core)"
```

---

## Task 8: Achievement engine (snapshot + idempotent unlock)

**Files:**
- Create: `src/server/achievements/engine.ts`
- Test: `tests/integration/achievement-engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/achievement-engine.test.ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runAchievementTick, buildAchievementContext } from '@/server/achievements/engine';

const prisma = new PrismaClient();
const U = '__w5_achievement_engine_user__';

async function reset() { await prisma.user.deleteMany({ where: { username: U } }); }
beforeEach(reset);
afterAll(async () => { await reset(); await prisma.$disconnect(); });

describe('achievement engine', () => {
  it('unlocks first_chat after one message and is idempotent on re-tick', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.activityEvent.create({ data: { userId: user.id, type: 'message_sent', payload: JSON.stringify({ npcId: 'lily' }) } });

    const first = await runAchievementTick(prisma, user.id);
    expect(first).toContain('first_chat');
    const again = await runAchievementTick(prisma, user.id);
    expect(again).not.toContain('first_chat'); // already unlocked → not re-reported
    expect(await prisma.userAchievement.count({ where: { userId: user.id, achievementId: 'first_chat' } })).toBe(1);
  });

  it('unlocks scenario_survivor + polite_mode for a completed B+ scenario', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    const session = await prisma.scenarioSession.create({
      data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'completed' },
    });
    await prisma.scenarioSummary.create({
      data: { sessionId: session.id, grade: 'B+', languageNote: '', pragmaticsNote: '', relationshipNote: '' },
    });

    const unlocked = await runAchievementTick(prisma, user.id);
    expect(unlocked).toEqual(expect.arrayContaining(['scenario_survivor', 'polite_mode']));
  });

  it('builds bestGrade and bilingual flags into the context', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: '早上好 morning', langDetect: 'mixed' } });

    const ctx = await buildAchievementContext(prisma, user.id);
    expect(ctx.hasBilingualThread).toBe(true);
    expect(ctx.totalNpcs).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run it; expect FAIL** — `npx vitest run tests/integration/achievement-engine.test.ts`.

> Precondition: the achievement defs must be seeded in the dev db (`npm run db:seed` seeds 6). If the suite reports 0 unlocks for `first_chat`, run `npm run db:seed` once and re-run. The engine itself returns `[]` (never throws) when no defs exist.

- [ ] **Step 3: Implement**

```ts
// src/server/achievements/engine.ts
import type { PrismaClient } from '@prisma/client';
import { computeStreak } from '@/server/users/streak';
import { GRADE_RANK, isUnlocked, type AchievementContext } from './rules';

function safeJson(s: string | null): Record<string, unknown> {
  if (!s) return {};
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
}

export async function buildAchievementContext(prisma: PrismaClient, userId: string): Promise<AchievementContext> {
  const [messageSentCount, completed, npcsAtFriendPlus, totalNpcs, threads, msgEvents] = await Promise.all([
    prisma.activityEvent.count({ where: { userId, type: 'message_sent' } }),
    prisma.scenarioSession.findMany({ where: { userId, status: 'completed' }, include: { summary: true } }),
    prisma.relationship.count({ where: { userId, stageValue: { gte: 2 } } }),
    prisma.npc.count(),
    prisma.thread.findMany({
      where: { userId },
      include: { messages: { where: { role: 'user' }, select: { langDetect: true } } },
    }),
    prisma.activityEvent.findMany({ where: { userId, type: 'message_sent' }, select: { createdAt: true } }),
  ]);

  let bestGrade = '—';
  for (const s of completed) {
    const g = s.summary?.grade ?? '—';
    if ((GRADE_RANK[g] ?? 0) > (GRADE_RANK[bestGrade] ?? 0)) bestGrade = g;
  }

  const hasBilingualThread = threads.some((t) => {
    const langs = new Set(t.messages.map((m) => m.langDetect));
    return langs.has('mixed') || (langs.has('zh') && langs.has('en'));
  });

  const streak = computeStreak(msgEvents.map((e) => e.createdAt));

  return {
    messageSentCount,
    completedScenarioCount: completed.length,
    bestGrade,
    npcsAtFriendPlus,
    totalNpcs,
    hasBilingualThread,
    streakDays: streak.days,
  };
}

// Module 7: evaluate enabled, not-yet-unlocked achievements; persist newly satisfied ones.
// Idempotent (UserAchievement is unique per [userId, achievementId]); never throws — it is a
// best-effort side effect of a chat/scenario turn.
export async function runAchievementTick(prisma: PrismaClient, userId: string): Promise<string[]> {
  try {
    const [defs, unlocked] = await Promise.all([
      prisma.achievementDef.findMany({ where: { enabled: true } }),
      prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }),
    ]);
    const have = new Set(unlocked.map((u) => u.achievementId));
    const pending = defs.filter((d) => !have.has(d.id));
    if (pending.length === 0) return [];

    const ctx = await buildAchievementContext(prisma, userId);
    const newly: string[] = [];
    for (const def of pending) {
      if (isUnlocked(def.rule, ctx, safeJson(def.ruleConfig))) {
        // Tolerate a concurrent insert: the unique constraint makes a duplicate harmless.
        await prisma.userAchievement.create({ data: { userId, achievementId: def.id } }).catch(() => {});
        newly.push(def.id);
      }
    }
    return newly;
  } catch (e) {
    console.error('[achievements] tick failed', e);
    return [];
  }
}
```

- [ ] **Step 4: Run it; expect PASS** — `npx vitest run tests/integration/achievement-engine.test.ts` → 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/achievements/engine.ts tests/integration/achievement-engine.test.ts
git -c core.autocrlf=false commit -m "feat: achievement engine — context snapshot + idempotent unlock tick"
```

---

## Task 9: Wire `runAchievementTick` into chat + scenario end

**Files:**
- Modify: `src/server/chat/streamChat.ts`
- Modify: `src/server/scenario/end.ts`
- Test: add cases to `tests/integration/stream-chat-correction.test.ts`? No — add a focused `tests/integration/achievement-engine.test.ts` is unit-of-engine; instead add a wiring assertion to `tests/integration/stream-chat.test.ts` and reuse `scenario-e2e.test.ts`.

- [ ] **Step 1: Add a failing wiring assertion in `tests/integration/stream-chat.test.ts`** — extend the existing first test (the `'__w2_streamchat_user__'` one) by appending, at the end of that `it`, an assertion that `first_chat` got unlocked:

```ts
    // W5: the achievement tick runs after a chat turn
    expect(await prisma.userAchievement.count({ where: { userId: user.id, achievementId: 'first_chat' } })).toBe(1);
```

- [ ] **Step 2: Run it; expect FAIL** — `npx vitest run tests/integration/stream-chat.test.ts` → the appended assertion fails (no tick yet). (Requires seeded defs; run `npm run db:seed` if needed.)

- [ ] **Step 3: Wire into `streamChat`** — add the import:

```ts
import { runAchievementTick } from '@/server/achievements/engine';
```

Insert after the grammar-correction block and before `await runPostTurnMemory(...)`:

```ts
  // Achievement engine tick (guarded internally; returns [] on any failure).
  await runAchievementTick(prisma, userId);
```

- [ ] **Step 4: Wire into `scenario/end.ts`** — add the import:

```ts
import { runAchievementTick } from '@/server/achievements/engine';
```

Insert immediately after the existing `scenario_completed` activity event + status update, before the `yield { event: 'scenario_end', ... }`:

```ts
  await runAchievementTick(prisma, session.userId);
```

So the tail of `runScenarioEnd` reads:

```ts
  await prisma.activityEvent.create({
    data: { userId: session.userId, type: 'scenario_completed', payload: JSON.stringify({ sessionId: session.id, grade }) },
  });
  await prisma.scenarioSession.update({ where: { id: session.id }, data: { status: 'completed', endedAt: new Date() } });
  await runAchievementTick(prisma, session.userId);

  yield {
    event: 'scenario_end',
    ...
  };
```

- [ ] **Step 5: Run the wiring + regression suites; expect PASS** — `npx vitest run tests/integration/stream-chat.test.ts tests/integration/scenario-e2e.test.ts tests/integration/scenario-end.test.ts`. The e2e completes a grade-A scenario; the tick now also writes `scenario_survivor`/`polite_mode`, but the e2e asserts none of those absent, so it stays green.

- [ ] **Step 6: Commit**

```bash
git add src/server/chat/streamChat.ts src/server/scenario/end.ts tests/integration/stream-chat.test.ts
git -c core.autocrlf=false commit -m "feat: run achievement tick after chat turns and scenario completion"
```

---

## Task 10: `GET /api/achievements`

**Files:**
- Create: `src/app/api/achievements/route.ts`
- Test: `tests/integration/achievements-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/achievements-route.test.ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w5_achievements_route_user__';

let GET: typeof import('@/app/api/achievements/route').GET;
beforeAll(async () => { ({ GET } = await import('@/app/api/achievements/route')); });
afterAll(async () => { await prisma.user.deleteMany({ where: { username: U } }); await prisma.$disconnect(); });

describe('GET /api/achievements', () => {
  it('returns every enabled def with the caller\'s unlock state', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.userAchievement.create({ data: { userId: user.id, achievementId: 'first_chat' } });

    const req = new Request('http://t/api/achievements', { headers: { cookie: `${SESSION_COOKIE}=${user.id}` } });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string; unlocked: boolean; unlockedAt: string | null }[];

    const first = body.find((a) => a.id === 'first_chat')!;
    expect(first.unlocked).toBe(true);
    expect(first.unlockedAt).not.toBeNull();
    const locked = body.find((a) => a.id === 'three_friends')!;
    expect(locked.unlocked).toBe(false);
    expect(locked.unlockedAt).toBeNull();
  });

  it('401s without a session cookie', async () => {
    const res = await GET(new Request('http://t/api/achievements'));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it; expect FAIL** — `npx vitest run tests/integration/achievements-route.test.ts`.

- [ ] **Step 3: Implement**

```ts
// src/app/api/achievements/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const [defs, unlocked] = await Promise.all([
      prisma.achievementDef.findMany({ where: { enabled: true }, orderBy: { id: 'asc' } }),
      prisma.userAchievement.findMany({ where: { userId } }),
    ]);
    const at = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));
    return json(
      defs.map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        icon: d.icon,
        unlocked: at.has(d.id),
        unlockedAt: at.get(d.id) ?? null,
      })),
    );
  });
}
```

- [ ] **Step 4: Run it; expect PASS** — `npx vitest run tests/integration/achievements-route.test.ts` → 2 pass.

- [ ] **Step 5: Full suite + typecheck**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: all green (W1–W4 + the new W5 tests), typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/achievements/route.ts tests/integration/achievements-route.test.ts
git -c core.autocrlf=false commit -m "feat: GET /api/achievements (defs + per-user unlock state)"
```

---

## Self-Review (run after writing; checklist, not a subagent)

**Spec coverage (§七 M5/M6/M7, §五.4, §五.8, §六):**
- M6 grammar correction — Tasks 4 (core), 5 (chat wiring + gate + persist + `correction` SSE), 6 (manual route). ✅
- M5 per-message progression — Tasks 1 (shared stage), 2 (helper + daily cap + stage-up event), 3 (chat wiring). Scenario-outcome path unchanged. ✅
- M7 achievements — Tasks 7 (rules for all 6 seeded defs), 8 (engine), 9 (tick after chat + scenario), 10 (`GET /api/achievements`). ✅
- `correction` SSE event (§六) — Task 5. ✅
- Manual correction route (§五.4) — Task 6. ✅
- Achievements list route (§五.8) — Task 10. ✅
- Workflow A steps e/f (relationship++, ActivityEvent → achievement tick) — Tasks 3 + 9. ✅
- Workflow B step 14 (AchievementEngine.tick after scenario end) — Task 9. ✅

**Placeholder scan:** none — every code/test step contains full code and exact commands. ✅

**Type consistency:** `stageForPoints` returns `{stage, stageValue}` everywhere; `applyMessageProgression` → `ProgressionResult`; `correctGrammar` → `Correction | null`; `AchievementContext` field names are identical across rules.ts (Task 7), engine.ts (Task 8), and the unit test (Task 7); `runAchievementTick(prisma, userId) → string[]` consistent across Tasks 8/9. The `correction` payload shape `{fixed, noteZh, tag}` matches between Tasks 5 and 6 and the schema column. ✅

**Regression guards called out explicitly:** stream-chat test 1 invariants (points=1/conv=1/msg_sent=1), scenario-e2e (points=78, friend→close), scenario-relationship (re-exported helpers). Each named in the task that could disturb it. ✅

**No migration:** confirmed — all columns/models pre-exist from W1. ✅
