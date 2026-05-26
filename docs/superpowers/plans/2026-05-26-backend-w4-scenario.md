# Backend W4 — Scenario Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the *Mock Interview* scenario work end-to-end — Lily proactively offers a scenario when the relationship + topic line up (B3 trigger), the user accepts into an embedded roleplay, each turn drives a forced-JSON state machine (impression / stress / turnsLeft + 3 stylized choices), and the final turn produces a graded summary, a personalised memory card, and a relationship stage-up. This is workflow A→B→C→D from the spec.

**Architecture:** A new `src/server/scenario/` module plus one memory helper. Pure logic (`state`, `transitions`, `schemas`, `invitation`, `prompt`) is unit-tested with no DB/Ollama. Stateful orchestration (`trigger`, `offer`, `accept`, `turn`, `end`, `relationship`, `sessionView`) and `memory/memoryCard` are integration-tested against the seeded dev SQLite DB with a **mocked** Ollama client (never a live model). The per-turn loop is an SSE generator modelled on `streamChat`; it uses `ollama.chatJson` (forced JSON + retry + Zod) and is fully guarded so a model failure degrades gracefully instead of throwing mid-stream. `streamChat` gains one guarded post-reply call to `maybeOfferScenario` (deterministic, no LLM) that can emit `scenario_offer`.

**Tech Stack:** TypeScript, Next.js 14 route handlers (Web `Response` + SSE), Prisma + SQLite, Zod, Vitest, Ollama HTTP client (`chatJson` / `embed`).

---

## Scope

### In scope (W4)
- **triggerJudge** (`judgeScenarioTrigger`): relationship stage ≥ `template.minStage` + ≥ N user turns + topic-keyword match + no open/declined session → returns `{ template, rationale }`. Deterministic (keyword overlap, **no LLM**).
- **Offer** (`maybeOfferScenario`): on a hit, create `ScenarioSession(status:'invited')` + an `invitation` message, return the offer draft. Wired into `streamChat` (guarded, after the reply).
- **State machine** (`transitions`): `invited → accepted/active → (paused ⇄ active) → completed`; branches `declined` / `aborted`.
- **Accept** (`acceptScenario`): `invited → active`, init `state`, generate the opening roleplay turn (`chatJson`) → `npc-roleplay` message + `ScenarioTurn(0)`; returns `{ session, openingMessage, choices }`.
- **Per-turn loop** (`runScenarioTurn`, SSE): save user choice/freetext → forced-JSON `{ npcReply, stateDelta, isFinalTurn, suggestedChoicesNext }` → apply delta → persist `ScenarioTurn` → emit `message_complete` → `state_update` → `choices`; on final turn run the end flow. Fully guarded (fallback turn on LLM failure).
- **End flow** (`runScenarioEnd`): forced-JSON graded summary (`grade` + 3 notes) → `ScenarioSummary` + `summary` message → `generateMemoryCard` → `applyScenarioOutcome(grade)` (points + stage recompute + `RelationshipEvent`) → `ActivityEvent('scenario_completed')` → `status:'completed'` → SSE `scenario_end`.
- **`generateMemoryCard`** (W3 deferred → here): forced-JSON `{ title, body }` → `Memory(sourceType:'scenario')`. Now the W3 `/api/memories*` endpoints surface real cards.
- **REST/SSE routes:** `GET /api/scenarios/catalog`, `GET /api/scenarios/sessions`, `GET /api/scenarios/sessions/:id`, `POST …/:id/accept`, `…/:id/decline`, `…/:id/choose` (SSE), `…/:id/freetype` (SSE), `…/:id/pause|resume|abort`.

### Deferred (NOT in W4 — SCOPE GUARD)
- **General Relationship/Progression module** (per-message points beyond the existing `+1`, daily cap, decay, acquaintance→friend auto-climb) → **W5**. W4 ships only the *scenario-outcome* stage recompute (`applyScenarioOutcome`); tests/demo seed `friend` stage to reach the trigger threshold.
- **Achievement Engine** → **W5**. W4 only emits `ActivityEvent('scenario_accepted' | 'scenario_completed')` for W5 to consume — no rule engine, no `UserAchievement` writes.
- **Grammar correction** (`correction` SSE / endpoint) and **suggestion chips** (`/threads/:npcId/suggestions`) → **W5/W6**.
- **LLM-authored invitation copy / LLM topic match** → polish later. W4 uses a deterministic NPC-voice invitation string and keyword-overlap topic match (keeps the casual turn single-LLM-call and tests stable).
- **Per-token streaming of scenario replies** → later. `chatJson` is non-streaming, so a scenario turn emits one `message_complete` (no `token` events). The SSE contract is otherwise honoured.
- **2nd scenario template** → **W8**. W4 makes the seeded `mock_interview` work; the orchestrator is template-driven so a 2nd template needs only seed data.
- **`MemoryRetrievalLog` / eval harness** → **W7** (untouched here).

## Conventions (match W2/W3)
- Route handlers return Web-standard `Response` via `@/server/http/respond` helpers (`json`, `errorJson`, `withUser`); add `export const dynamic = 'force-dynamic';`. SSE routes do manual `requireUser` + `errorJson(401, …)` then `sseResponse(gen)` (mirror `threads/[npcId]/messages/route.ts`).
- **SCOPE GUARD every commit:** `git status --short` first; `git add` only the task's named files; never `git add -A`/`.`. `.claude/settings.local.json` stays dirty (harness noise); `dev.db*` are gitignored. On Windows, if a commit is blocked by CRLF/autocrlf, retry the commit prefixed with `git -c core.autocrlf=false`.
- **Multi-user isolation (project principle #1):** every scenario query is scoped — load a session with `findFirst({ where: { id, userId } })`, never a bare `findUnique({ where: { id } })`. A foreign session id returns 404, never another user's data.
- Unit tests (`tests/unit/`) run with no DB and no Ollama. Integration tests (`tests/integration/`) use `new PrismaClient()` against the seeded dev DB, unique `__w4_…__` usernames, and clean up in `afterAll` (`deleteMany({ where: { username } })` cascades). Ollama is always mocked — either a hand-rolled `{ chatJson: vi.fn(), embed: vi.fn() }` stub (preferred for scenario services) or `new OllamaClient({ fetchImpl })` (for the `streamChat` path).
- Run a single test file: `npx vitest run tests/<path>`. Full suite: `npm run test`. Types: `npm run typecheck`.
- Branch: `backend/w4-scenario`.

## File Structure
```
src/server/scenario/
  state.ts            # ScenarioState, initState(), applyDelta(), clampImpression()
  transitions.ts      # canTransition(), TERMINAL, isTerminal()
  schemas.ts          # ScenarioTurnSchema, ScenarioSummarySchema, MemoryCardSchema
  trigger.ts          # judgeScenarioTrigger(), STAGE_VALUE, MIN_USER_TURNS
  invitation.ts       # buildInvitationDraft(), invitationText()
  offer.ts            # maybeOfferScenario()
  prompt.ts           # buildScenarioSystem(), buildScenarioMessages()
  accept.ts           # acceptScenario()
  turn.ts             # runScenarioTurn() — SSE generator (choose/freetype)
  end.ts              # runScenarioEnd() — summary + memory + relationship + scenario_end
  relationship.ts     # applyScenarioOutcome(), gradePoints(), stageForPoints()
  sessionView.ts      # mapSessionListItem(), mapSessionDetail()
src/server/memory/memoryCard.ts                       # generateMemoryCard()
src/server/chat/streamChat.ts                         # MODIFY: maybeOfferScenario after reply
src/app/api/scenarios/catalog/route.ts                # GET
src/app/api/scenarios/sessions/route.ts               # GET (list)
src/app/api/scenarios/sessions/[id]/route.ts          # GET (detail)
src/app/api/scenarios/sessions/[id]/accept/route.ts   # POST (JSON)
src/app/api/scenarios/sessions/[id]/decline/route.ts  # POST (JSON)
src/app/api/scenarios/sessions/[id]/pause/route.ts    # POST (JSON)
src/app/api/scenarios/sessions/[id]/resume/route.ts   # POST (JSON)
src/app/api/scenarios/sessions/[id]/abort/route.ts    # POST (JSON)
src/app/api/scenarios/sessions/[id]/choose/route.ts   # POST (SSE)
src/app/api/scenarios/sessions/[id]/freetype/route.ts # POST (SSE)
tests/unit/                # scenario-state, scenario-transitions, scenario-schemas, scenario-invitation, scenario-prompt
tests/integration/         # scenario-trigger, scenario-offer, stream-chat-scenario, scenario-accept, scenario-turn,
                           # scenario-relationship, memory-card, scenario-end, scenario-routes, scenario-e2e
```

---

### Task 1: Scenario state model

**Files:**
- Create: `src/server/scenario/state.ts`
- Test: `tests/unit/scenario-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/scenario-state.test.ts
import { describe, it, expect } from 'vitest';
import { initState, applyDelta, clampImpression, type ScenarioState } from '@/server/scenario/state';

describe('scenario state', () => {
  it('initState seeds impression 5, role stress, turnsLeft from template, turnIndex 0', () => {
    const s = initState({ estimatedTurns: 6 }, { defaultStress: 'Medium' });
    expect(s).toEqual({ impression: 5, stress: 'Medium', turnsLeft: 6, turnIndex: 0 });
  });

  it('initState falls back to Medium stress and 6 turns', () => {
    const s = initState({ estimatedTurns: 0 }, undefined);
    expect(s.stress).toBe('Medium');
    expect(s.turnsLeft).toBe(6);
  });

  it('applyDelta adds the impression delta, sets stress, decrements turnsLeft, bumps turnIndex', () => {
    const before: ScenarioState = { impression: 5, stress: 'Low', turnsLeft: 4, turnIndex: 1 };
    const after = applyDelta(before, { impression: 2, stress: 'High' });
    expect(after).toEqual({ impression: 7, stress: 'High', turnsLeft: 3, turnIndex: 2 });
  });

  it('clamps impression to 0..10 and never lets turnsLeft go below 0', () => {
    expect(clampImpression(12)).toBe(10);
    expect(clampImpression(-4)).toBe(0);
    const after = applyDelta({ impression: 9, stress: 'Low', turnsLeft: 0, turnIndex: 9 }, { impression: 5, stress: 'Low' });
    expect(after.impression).toBe(10);
    expect(after.turnsLeft).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scenario-state.test.ts`
Expected: FAIL — `Cannot find module '@/server/scenario/state'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/scenario/state.ts
export type Stress = 'Low' | 'Medium' | 'High';

export interface ScenarioState {
  impression: number; // 0..10
  stress: Stress;
  turnsLeft: number;
  turnIndex: number;
}

export interface StateDelta {
  impression: number; // small signed delta
  stress: Stress;
}

export function clampImpression(n: number): number {
  return Math.max(0, Math.min(10, n));
}

export function initState(
  template: { estimatedTurns: number },
  role: { defaultStress?: string } | undefined,
): ScenarioState {
  const stress = (role?.defaultStress as Stress) ?? 'Medium';
  return {
    impression: 5,
    stress: ['Low', 'Medium', 'High'].includes(stress) ? stress : 'Medium',
    turnsLeft: template.estimatedTurns > 0 ? template.estimatedTurns : 6,
    turnIndex: 0,
  };
}

export function applyDelta(state: ScenarioState, delta: StateDelta): ScenarioState {
  return {
    impression: clampImpression(state.impression + (delta.impression ?? 0)),
    stress: delta.stress ?? state.stress,
    turnsLeft: Math.max(0, state.turnsLeft - 1),
    turnIndex: state.turnIndex + 1,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scenario-state.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/scenario/state.ts tests/unit/scenario-state.test.ts
git commit -m "feat: scenario state model (init/applyDelta/clamp)"
```

---

### Task 2: Status transition guard

**Files:**
- Create: `src/server/scenario/transitions.ts`
- Test: `tests/unit/scenario-transitions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/scenario-transitions.test.ts
import { describe, it, expect } from 'vitest';
import { canTransition, isTerminal } from '@/server/scenario/transitions';

describe('scenario transitions', () => {
  it('allows the happy path', () => {
    expect(canTransition('invited', 'active')).toBe(true);
    expect(canTransition('active', 'paused')).toBe(true);
    expect(canTransition('paused', 'active')).toBe(true);
    expect(canTransition('active', 'completed')).toBe(true);
  });

  it('allows decline only from invited and abort from non-terminal states', () => {
    expect(canTransition('invited', 'declined')).toBe(true);
    expect(canTransition('active', 'declined')).toBe(false);
    expect(canTransition('active', 'aborted')).toBe(true);
    expect(canTransition('paused', 'aborted')).toBe(true);
  });

  it('forbids transitions out of terminal states', () => {
    expect(canTransition('completed', 'active')).toBe(false);
    expect(canTransition('declined', 'active')).toBe(false);
    expect(canTransition('aborted', 'active')).toBe(false);
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('invited')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scenario-transitions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/scenario/transitions.ts
export type ScenarioStatus =
  | 'invited' | 'accepted' | 'active' | 'paused' | 'completed' | 'declined' | 'aborted';

export const TERMINAL: ScenarioStatus[] = ['completed', 'declined', 'aborted'];

const ALLOWED: Record<ScenarioStatus, ScenarioStatus[]> = {
  invited: ['active', 'accepted', 'declined', 'aborted'],
  accepted: ['active', 'aborted'],
  active: ['paused', 'completed', 'aborted'],
  paused: ['active', 'aborted'],
  completed: [],
  declined: [],
  aborted: [],
};

export function isTerminal(status: string): boolean {
  return TERMINAL.includes(status as ScenarioStatus);
}

export function canTransition(from: string, to: string): boolean {
  const next = ALLOWED[from as ScenarioStatus];
  return Array.isArray(next) && next.includes(to as ScenarioStatus);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scenario-transitions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/scenario/transitions.ts tests/unit/scenario-transitions.test.ts
git commit -m "feat: scenario status transition guard"
```

---

### Task 3: Forced-JSON Zod schemas

**Files:**
- Create: `src/server/scenario/schemas.ts`
- Test: `tests/unit/scenario-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/scenario-schemas.test.ts
import { describe, it, expect } from 'vitest';
import { ScenarioTurnSchema, ScenarioSummarySchema, MemoryCardSchema } from '@/server/scenario/schemas';

describe('scenario schemas', () => {
  it('parses a valid turn and defaults missing choices to []', () => {
    const t = ScenarioTurnSchema.parse({
      npcReply: 'Tell me about yourself.',
      stateDelta: { impression: 1, stress: 'Medium' },
      isFinalTurn: false,
    });
    expect(t.suggestedChoicesNext).toEqual([]);
    expect(t.stateDelta.stress).toBe('Medium');
  });

  it('rejects a turn with an invalid stress value', () => {
    expect(() =>
      ScenarioTurnSchema.parse({ npcReply: 'x', stateDelta: { impression: 0, stress: 'Panic' }, isFinalTurn: false }),
    ).toThrow();
  });

  it('parses a summary and a memory card', () => {
    expect(ScenarioSummarySchema.parse({ grade: 'B+', languageNote: 'a', pragmaticsNote: 'b', relationshipNote: 'c' }).grade).toBe('B+');
    expect(MemoryCardSchema.parse({ title: 'Polite Disagree-er', body: 'Hedges before pushing back.' }).title).toBe('Polite Disagree-er');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scenario-schemas.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/scenario/schemas.ts
import { z } from 'zod';

export const StressSchema = z.enum(['Low', 'Medium', 'High']);

export const ChoiceSchema = z.object({
  id: z.string(),
  text: z.string(),
  tone: z.string(),
  desc: z.string().default(''),
});

export const ScenarioTurnSchema = z.object({
  npcReply: z.string().min(1),
  stateDelta: z.object({ impression: z.number(), stress: StressSchema }),
  isFinalTurn: z.boolean(),
  suggestedChoicesNext: z.array(ChoiceSchema).default([]),
});
export type ScenarioTurnJson = z.infer<typeof ScenarioTurnSchema>;

export const ScenarioSummarySchema = z.object({
  grade: z.string().min(1),
  languageNote: z.string(),
  pragmaticsNote: z.string(),
  relationshipNote: z.string(),
});
export type ScenarioSummaryJson = z.infer<typeof ScenarioSummarySchema>;

export const MemoryCardSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});
export type MemoryCardJson = z.infer<typeof MemoryCardSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scenario-schemas.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/scenario/schemas.ts tests/unit/scenario-schemas.test.ts
git commit -m "feat: scenario forced-JSON zod schemas"
```

---

### Task 4: triggerJudge — decide whether to offer a scenario

**Files:**
- Create: `src/server/scenario/trigger.ts`
- Test: `tests/integration/scenario-trigger.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/scenario-trigger.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { judgeScenarioTrigger } from '@/server/scenario/trigger';

const prisma = new PrismaClient();
const U = '__w4_trigger_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

async function freshThread(stage: string, stageValue: number, userTurns: number) {
  await prisma.user.deleteMany({ where: { username: U } });
  const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
  const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
  await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage, stageValue } });
  for (let i = 0; i < userTurns; i++) {
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: `m${i}` } });
  }
  return { user, thread };
}

describe('judgeScenarioTrigger', () => {
  it('hits when stage>=minStage, enough turns, and the text matches a topic keyword', async () => {
    const { user, thread } = await freshThread('friend', 2, 4);
    const hit = await judgeScenarioTrigger({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'can we practise a job interview?' });
    expect(hit?.template.id).toBe('mock_interview');
    expect(hit?.rationale.topicMatch).toBe('interview');
  });

  it('misses below the stage threshold even with a topic match', async () => {
    const { user, thread } = await freshThread('acquaintance', 1, 4);
    const hit = await judgeScenarioTrigger({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'interview please' });
    expect(hit).toBeNull();
  });

  it('misses with too few user turns, or no keyword match', async () => {
    const a = await freshThread('friend', 2, 1);
    expect(await judgeScenarioTrigger({ prisma, userId: a.user.id, npcId: 'lily', threadId: a.thread.id, text: 'interview' })).toBeNull();
    const b = await freshThread('friend', 2, 4);
    expect(await judgeScenarioTrigger({ prisma, userId: b.user.id, npcId: 'lily', threadId: b.thread.id, text: 'nice coffee today' })).toBeNull();
  });

  it('does not re-offer when an open or declined session already exists', async () => {
    const { user, thread } = await freshThread('friend', 2, 4);
    const sess = await prisma.scenarioSession.create({
      data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'invited' },
    });
    expect(await judgeScenarioTrigger({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'interview' })).toBeNull();
    await prisma.scenarioSession.update({ where: { id: sess.id }, data: { status: 'declined' } });
    expect(await judgeScenarioTrigger({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'interview' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/scenario-trigger.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/scenario/trigger.ts
import type { PrismaClient, ScenarioTemplate } from '@prisma/client';

export const STAGE_VALUE: Record<string, number> = { acquaintance: 1, friend: 2, close: 3 };
export const MIN_USER_TURNS = 3; // user must have warmed up the thread before any offer

export interface TriggerRationale {
  topicMatch: string;
  turnCount: number;
  stage: string;
}

export interface TriggerDeps {
  prisma: PrismaClient;
  userId: string;
  npcId: string;
  threadId: string;
  text: string;
}

// Deterministic B3 trigger: relationship stage + warmed-up thread + topic-keyword match, no open/declined session.
// No LLM — keeps the casual chat turn a single model call and the decision unit-testable.
export async function judgeScenarioTrigger(
  deps: TriggerDeps,
): Promise<{ template: ScenarioTemplate; rationale: TriggerRationale } | null> {
  const { prisma, userId, npcId, threadId, text } = deps;

  const templates = await prisma.scenarioTemplate.findMany({ where: { npcId, enabled: true } });
  if (templates.length === 0) return null;

  const rel = await prisma.relationship.findUnique({ where: { userId_npcId: { userId, npcId } } });
  const stageValue = rel?.stageValue ?? 1;

  // never double-offer: any non-terminal session for this NPC blocks a new offer
  const open = await prisma.scenarioSession.findFirst({
    where: { userId, npcId, status: { in: ['invited', 'accepted', 'active', 'paused'] } },
  });
  if (open) return null;

  const userTurns = await prisma.message.count({ where: { threadId, role: 'user' } });
  if (userTurns < MIN_USER_TURNS) return null;

  const lower = text.toLowerCase();
  for (const t of templates) {
    if (stageValue < (STAGE_VALUE[t.minStage] ?? 99)) continue;
    const declined = await prisma.scenarioSession.findFirst({
      where: { userId, npcId, templateId: t.id, status: 'declined' },
    });
    if (declined) continue; // don't nag after a decline (re-offer tuning deferred)
    const keywords = JSON.parse(t.topicKeywords) as string[];
    const matched = keywords.find((k) => lower.includes(k.toLowerCase()));
    if (!matched) continue;
    return { template: t, rationale: { topicMatch: matched, turnCount: userTurns, stage: rel?.stage ?? 'acquaintance' } };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/scenario-trigger.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/scenario/trigger.ts tests/integration/scenario-trigger.test.ts
git commit -m "feat: scenario triggerJudge (stage + turns + topic match)"
```

---

### Task 5: Invitation draft + copy

**Files:**
- Create: `src/server/scenario/invitation.ts`
- Test: `tests/unit/scenario-invitation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/scenario-invitation.test.ts
import { describe, it, expect } from 'vitest';
import { buildInvitationDraft, invitationText } from '@/server/scenario/invitation';

const template = {
  id: 'mock_interview', title: 'Mock Interview', titleZh: '模拟面试',
  estimatedMinutes: 8, registerTags: JSON.stringify(['Formal register']),
};

describe('invitation', () => {
  it('builds a draft from template metadata + rationale', () => {
    const d = buildInvitationDraft(template, { topicMatch: 'interview', turnCount: 4, stage: 'friend' });
    expect(d.title).toBe('Mock Interview');
    expect(d.estMinutes).toBe(8);
    expect(d.rationale).toContain('interview');
    expect(d.detail.length).toBeGreaterThan(0);
  });

  it('writes NPC-voice invitation copy that names the scenario and duration', () => {
    const text = invitationText(template);
    expect(text).toContain('Mock Interview');
    expect(text).toContain('8');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scenario-invitation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/scenario/invitation.ts
import type { TriggerRationale } from './trigger';

export interface InvitationDraft {
  title: string;
  detail: string;
  estMinutes: number;
  rationale: string;
}

interface TemplateLike {
  title: string;
  titleZh?: string | null;
  estimatedMinutes: number;
  registerTags: string; // JSON string[]
}

export function buildInvitationDraft(template: TemplateLike, rationale: TriggerRationale): InvitationDraft {
  const tags = (JSON.parse(template.registerTags) as string[]).join(', ');
  return {
    title: template.title,
    detail: `A short roleplay to practise: ${tags || 'real-world register'}.`,
    estMinutes: template.estimatedMinutes,
    rationale: `You mentioned "${rationale.topicMatch}" — want to try this while we're on the topic?`,
  };
}

export function invitationText(template: TemplateLike): string {
  return `Hey — want to try a "${template.title}" with me? I'll stay in character, it's about ${template.estimatedMinutes} minutes. Totally optional — just say the word.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scenario-invitation.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/scenario/invitation.ts tests/unit/scenario-invitation.test.ts
git commit -m "feat: scenario invitation draft + npc-voice copy"
```

---

### Task 6: maybeOfferScenario — create the invited session

**Files:**
- Create: `src/server/scenario/offer.ts`
- Test: `tests/integration/scenario-offer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/scenario-offer.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { maybeOfferScenario } from '@/server/scenario/offer';

const prisma = new PrismaClient();
const U = '__w4_offer_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('maybeOfferScenario', () => {
  it('creates an invited session + invitation message and returns the draft on a hit', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
    for (let i = 0; i < 4; i++) await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: `m${i}` } });

    const offer = await maybeOfferScenario({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'lets do an interview' });
    expect(offer).not.toBeNull();
    expect(offer!.draft.title).toBe('Mock Interview');

    const sess = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: offer!.sessionId } });
    expect(sess.status).toBe('invited');
    expect(JSON.parse(sess.triggerRationale!).topicMatch).toBe('interview');

    const inv = await prisma.message.findFirst({ where: { scenarioSessionId: sess.id, role: 'invitation' } });
    expect(inv?.text).toContain('Mock Interview');
  });

  it('returns null when nothing matches', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const thread = await prisma.thread.findFirstOrThrow({ where: { userId: user.id, npcId: 'lily' } });
    // an open session now exists from the previous test → blocked
    const offer = await maybeOfferScenario({ prisma, userId: user.id, npcId: 'lily', threadId: thread.id, text: 'interview' });
    expect(offer).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/scenario-offer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/scenario/offer.ts
import type { PrismaClient } from '@prisma/client';
import { judgeScenarioTrigger } from './trigger';
import { buildInvitationDraft, invitationText, type InvitationDraft } from './invitation';

export interface OfferDeps {
  prisma: PrismaClient;
  userId: string;
  npcId: string;
  threadId: string;
  text: string;
}

export interface ScenarioOffer {
  sessionId: string;
  draft: InvitationDraft;
}

// Called by streamChat after the reply (guarded). Deterministic, no LLM.
export async function maybeOfferScenario(deps: OfferDeps): Promise<ScenarioOffer | null> {
  const hit = await judgeScenarioTrigger(deps);
  if (!hit) return null;

  const draft = buildInvitationDraft(hit.template, hit.rationale);
  const session = await deps.prisma.scenarioSession.create({
    data: {
      userId: deps.userId,
      npcId: deps.npcId,
      threadId: deps.threadId,
      templateId: hit.template.id,
      status: 'invited',
      triggerRationale: JSON.stringify(hit.rationale),
    },
  });
  await deps.prisma.message.create({
    data: {
      threadId: deps.threadId,
      userId: null,
      role: 'invitation',
      text: invitationText(hit.template),
      scenarioSessionId: session.id,
      meta: JSON.stringify({ invitationSessionId: session.id }),
    },
  });
  return { sessionId: session.id, draft };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/scenario-offer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/scenario/offer.ts tests/integration/scenario-offer.test.ts
git commit -m "feat: maybeOfferScenario creates invited session + invitation msg"
```

---

### Task 7: Wire the offer into streamChat

**Files:**
- Modify: `src/server/chat/streamChat.ts`
- Test: `tests/integration/stream-chat-scenario.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/stream-chat-scenario.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OllamaClient } from '@/server/llm/ollama';
import { streamChat } from '@/server/chat/streamChat';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const U = '__w4_streamoffer_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

function ndjson(lines: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) { for (const l of lines) c.enqueue(enc.encode(l + '\n')); c.close(); },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe('streamChat scenario offer', () => {
  it('emits scenario_offer when the user is a friend and mentions a scenario topic', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
    for (let i = 0; i < 4; i++) await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: `warmup ${i}` } });

    // streaming chat reply, then factExtract chatJson returns no facts
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      if (b.stream === true) return ndjson([JSON.stringify({ message: { content: 'sure!' }, done: true })]);
      return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ facts: [] }) } }) } as unknown as Response;
    });
    const ollama = new OllamaClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const events: SseEvent[] = [];
    for await (const e of streamChat({ prisma, ollama, userId: user.id, npcId: 'lily', text: 'can we do a mock interview?' })) {
      events.push(e);
    }

    const offer = events.find((e) => e.event === 'scenario_offer');
    expect(offer).toBeTruthy();
    expect((offer!.data as { draft: { title: string } }).draft.title).toBe('Mock Interview');
    expect(events[events.length - 1].event).toBe('done');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/stream-chat-scenario.test.ts`
Expected: FAIL — `streamChat` does not emit `scenario_offer` yet.

- [ ] **Step 3: Add the guarded offer call to streamChat**

Add the import near the other memory/chat imports at the top of `src/server/chat/streamChat.ts`:

```ts
import { maybeOfferScenario } from '@/server/scenario/offer';
```

Then, in `streamChat`, replace the post-turn memory call + final `done` (currently lines ~111-113):

```ts
  await runPostTurnMemory({ prisma, ollama, userId, threadId: thread.id, userText: text, userMsgId: userMsg.id });

  yield { event: 'done', data: {} };
```

with:

```ts
  await runPostTurnMemory({ prisma, ollama, userId, threadId: thread.id, userText: text, userMsgId: userMsg.id });

  // B3 trigger: offer a scenario when the relationship + topic line up. Guarded — never breaks the chat turn.
  try {
    const offer = await maybeOfferScenario({ prisma, userId, npcId, threadId: thread.id, text });
    if (offer) yield { event: 'scenario_offer', data: offer };
  } catch (e) {
    console.error('[scenario] offer failed', e);
  }

  yield { event: 'done', data: {} };
```

- [ ] **Step 4: Run the new test + the existing chat regression suite**

Run: `npx vitest run tests/integration/stream-chat-scenario.test.ts tests/integration/stream-chat.test.ts tests/integration/stream-chat-memory.test.ts`
Expected: PASS. The W2/W3 stream tests stay green because their relationships are `acquaintance` (below `friend`) and their text contains no scenario keyword → `maybeOfferScenario` returns `null`.

- [ ] **Step 5: Commit**

```bash
git add src/server/chat/streamChat.ts tests/integration/stream-chat-scenario.test.ts
git commit -m "feat: emit scenario_offer from streamChat (guarded B3 trigger)"
```

---

### Task 8: Scenario prompt builder

**Files:**
- Create: `src/server/scenario/prompt.ts`
- Test: `tests/unit/scenario-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/scenario-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildScenarioSystem, buildScenarioMessages } from '@/server/scenario/prompt';

const state = { impression: 5, stress: 'Medium' as const, turnsLeft: 4, turnIndex: 1 };

describe('scenario prompt', () => {
  it('system prompt carries role, state line, and the JSON contract', () => {
    const s = buildScenarioSystem({ roleName: 'Linda', instructions: 'You are an HR manager.', userLanguage: 'zh-CN', state });
    expect(s).toContain('Linda');
    expect(s).toContain('turnsLeft: 4');
    expect(s).toContain('"isFinalTurn"');
    expect(s).toContain('native Chinese');
  });

  it('opening run appends a greeting nudge; turn run does not', () => {
    const opening = buildScenarioMessages({
      roleName: 'Linda', instructions: 'x', userLanguage: 'en-US', state, history: [], opening: true,
    });
    expect(opening[0].role).toBe('system');
    expect(opening[opening.length - 1].role).toBe('user');
    expect(opening[opening.length - 1].content).toContain('sat down');

    const turn = buildScenarioMessages({
      roleName: 'Linda', instructions: 'x', userLanguage: 'en-US', state,
      history: [{ role: 'user', text: 'Hi', userId: 'u1' }, { role: 'npc-roleplay', text: 'Welcome.', userId: null }],
    });
    expect(turn.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(turn[turn.length - 1].role).toBe('assistant');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scenario-prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/scenario/prompt.ts
import type { ChatMessage } from '@/server/llm/ollama';
import type { ScenarioState } from './state';

const JSON_CONTRACT =
  'Respond ONLY with a JSON object matching: ' +
  '{"npcReply": string, "stateDelta": {"impression": number, "stress": "Low"|"Medium"|"High"}, ' +
  '"isFinalTurn": boolean, "suggestedChoicesNext": [{"id": string, "text": string, "tone": string, "desc": string}]}. ' +
  'No prose outside the JSON.';

export function buildScenarioSystem(args: {
  roleName: string;
  instructions: string;
  userLanguage: string;
  state: ScenarioState;
}): string {
  return [
    `ROLEPLAY: You are "${args.roleName}". ${args.instructions} Keep each reply to 1-3 sentences and stay in character.`,
    `Current state — impression: ${args.state.impression}/10, stress: ${args.state.stress}, turnsLeft: ${args.state.turnsLeft}.`,
    '"stateDelta.impression" is a small delta from -3 to +3 to add to the current impression based on how the user just did. ' +
      'Set "isFinalTurn": true when turnsLeft is 1 or fewer, or the conversation reaches a natural close. ' +
      'Provide exactly 3 "suggestedChoicesNext" with distinct tones (e.g. Diplomatic / Confident / Reflective).',
    args.userLanguage === 'zh-CN'
      ? 'The user is a native Chinese speaker practising English; stay in character even if they make mistakes.'
      : '',
    JSON_CONTRACT,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildScenarioMessages(args: {
  roleName: string;
  instructions: string;
  userLanguage: string;
  state: ScenarioState;
  history: { role: string; text: string; userId: string | null }[];
  opening?: boolean;
}): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildScenarioSystem(args) },
    ...args.history.map((m): ChatMessage => ({ role: m.userId ? 'user' : 'assistant', content: m.text })),
  ];
  if (args.opening) {
    messages.push({ role: 'user', content: '(The candidate has just sat down. Greet them in character and ask your first question.)' });
  }
  return messages;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scenario-prompt.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/scenario/prompt.ts tests/unit/scenario-prompt.test.ts
git commit -m "feat: scenario roleplay prompt builder"
```

---

### Task 9: acceptScenario — invited → active + opening turn

**Files:**
- Create: `src/server/scenario/accept.ts`
- Create: `src/app/api/scenarios/sessions/[id]/accept/route.ts`
- Test: `tests/integration/scenario-accept.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/scenario-accept.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { acceptScenario } from '@/server/scenario/accept';

const prisma = new PrismaClient();
const U = '__w4_accept_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

async function invitedSession() {
  await prisma.user.deleteMany({ where: { username: U } });
  const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
  const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
  await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
  const session = await prisma.scenarioSession.create({
    data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'invited' },
  });
  return { user, thread, session };
}

describe('acceptScenario', () => {
  it('activates the session, persists state, and creates the opening roleplay turn', async () => {
    const { user, session } = await invitedSession();
    const ollama = {
      chatJson: vi.fn().mockResolvedValue({
        npcReply: 'Welcome. Tell me about yourself.',
        stateDelta: { impression: 0, stress: 'Medium' },
        isFinalTurn: false,
        suggestedChoicesNext: [{ id: 'c1', text: 'I am a developer.', tone: 'Confident', desc: '' }],
      }),
      embed: vi.fn(),
    };

    const result = await acceptScenario({ prisma, ollama, userId: user.id, sessionId: session.id });
    expect(result.openingMessage.text).toContain('Welcome');
    expect(result.choices).toHaveLength(1);
    expect(result.state.turnsLeft).toBe(6); // mock_interview estimatedTurns
    expect(result.state.impression).toBe(5);

    const reloaded = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(reloaded.status).toBe('active');
    expect(reloaded.startedAt).not.toBeNull();

    const turn0 = await prisma.scenarioTurn.findUniqueOrThrow({ where: { sessionId_turnIndex: { sessionId: session.id, turnIndex: 0 } } });
    expect(turn0.npcMessageId).not.toBeNull();
    expect(JSON.parse(turn0.nextChoices!)).toHaveLength(1);

    const accepted = await prisma.activityEvent.count({ where: { userId: user.id, type: 'scenario_accepted' } });
    expect(accepted).toBe(1);
  });

  it('rejects a foreign session (isolation) and a non-invited session', async () => {
    const { session } = await invitedSession();
    const ollama = { chatJson: vi.fn(), embed: vi.fn() };
    await expect(acceptScenario({ prisma, ollama, userId: 'someone-else', sessionId: session.id })).rejects.toThrow(/not found/i);
    await prisma.scenarioSession.update({ where: { id: session.id }, data: { status: 'completed' } });
    const owner = await prisma.user.findFirstOrThrow({ where: { username: U } });
    await expect(acceptScenario({ prisma, ollama, userId: owner.id, sessionId: session.id })).rejects.toThrow(/cannot accept/i);
    expect(ollama.chatJson).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/scenario-accept.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the accept service**

```ts
// src/server/scenario/accept.ts
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';
import { canTransition } from './transitions';
import { initState, type ScenarioState } from './state';
import { buildScenarioMessages } from './prompt';
import { ScenarioTurnSchema } from './schemas';
import { resolveRole } from './role';
import { mapSessionDetail, type SessionDetail } from './sessionView';

export class ScenarioError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'ScenarioError'; }
}

export interface AcceptDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson'>;
  userId: string;
  sessionId: string;
}

export interface AcceptResult {
  session: SessionDetail;
  openingMessage: { id: string; text: string };
  choices: unknown[];
  state: ScenarioState;
}

export async function acceptScenario(deps: AcceptDeps): Promise<AcceptResult> {
  const { prisma, ollama, userId, sessionId } = deps;

  const session = await prisma.scenarioSession.findFirst({
    where: { id: sessionId, userId },
    include: { template: true, npc: true },
  });
  if (!session) throw new ScenarioError('NOT_FOUND', 'Scenario session not found');
  if (!canTransition(session.status, 'active')) {
    throw new ScenarioError('CONFLICT', `cannot accept a session in status "${session.status}"`);
  }

  const { roleName } = resolveRole(session.npc, session.template);
  const state = initState(session.template, undefined) ;
  state.stress = resolveRole(session.npc, session.template).defaultStress;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const messages = buildScenarioMessages({
    roleName,
    instructions: session.template.systemPrompt,
    userLanguage: user?.language ?? 'zh-CN',
    state,
    history: [],
    opening: true,
  });

  let turn;
  try {
    turn = await ollama.chatJson(messages, ScenarioTurnSchema, { options: { temperature: 0.7 } });
  } catch (e) {
    console.error('[scenario] opening generation failed, using fallback', e);
    turn = {
      npcReply: `Thanks for coming in. Let's begin — could you tell me a little about yourself?`,
      stateDelta: { impression: 0, stress: state.stress },
      isFinalTurn: false,
      suggestedChoicesNext: [],
    };
  }

  const npcMsg = await prisma.message.create({
    data: {
      threadId: session.threadId, userId: null, role: 'npc-roleplay', text: turn.npcReply,
      scenarioSessionId: session.id, meta: JSON.stringify({ roleplayCharacter: roleName }),
    },
  });
  await prisma.scenarioTurn.create({
    data: {
      sessionId: session.id, turnIndex: 0, npcMessageId: npcMsg.id,
      stateBefore: '{}', stateAfter: JSON.stringify(state),
      nextChoices: JSON.stringify(turn.suggestedChoicesNext),
    },
  });
  await prisma.scenarioSession.update({
    where: { id: session.id },
    data: { status: 'active', startedAt: new Date(), state: JSON.stringify(state) },
  });
  await prisma.activityEvent.create({
    data: { userId, type: 'scenario_accepted', payload: JSON.stringify({ sessionId: session.id, templateId: session.templateId }) },
  });

  const fresh = await prisma.scenarioSession.findUniqueOrThrow({
    where: { id: session.id }, include: { template: true, summary: true },
  });
  return {
    session: mapSessionDetail(fresh, []),
    openingMessage: { id: npcMsg.id, text: turn.npcReply },
    choices: turn.suggestedChoicesNext,
    state,
  };
}
```

- [ ] **Step 4: Add the `resolveRole` helper (shared by accept/turn)**

```ts
// src/server/scenario/role.ts
interface NpcLike { scenarioRoles: string }
interface TemplateLike { rolePlayedBy: string }

export interface ResolvedRole { roleName: string; defaultStress: 'Low' | 'Medium' | 'High' }

// Finds the NPC's roleplay role for a template; falls back gracefully if seed data is sparse.
export function resolveRole(npc: NpcLike, template: TemplateLike): ResolvedRole {
  const roles = JSON.parse(npc.scenarioRoles) as { id: string; name: string; defaultStress: string }[];
  const role = roles.find((r) => r.id === template.rolePlayedBy);
  const stress = role?.defaultStress;
  return {
    roleName: role?.name ?? template.rolePlayedBy,
    defaultStress: stress === 'Low' || stress === 'High' ? stress : 'Medium',
  };
}
```

Then simplify the state-init lines in `accept.ts` to use it directly:

```ts
  const { roleName, defaultStress } = resolveRole(session.npc, session.template);
  const state = initState(session.template, { defaultStress });
```

(Remove the two earlier `resolveRole(...)` calls / the `state.stress = …` line.)

- [ ] **Step 5: Add the accept route**

```ts
// src/app/api/scenarios/sessions/[id]/accept/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { OllamaClient } from '@/server/llm/ollama';
import { acceptScenario, ScenarioError } from '@/server/scenario/accept';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    try {
      const result = await acceptScenario({ prisma, ollama: new OllamaClient(), userId, sessionId: params.id });
      return json(result);
    } catch (e) {
      if (e instanceof ScenarioError) {
        return errorJson(e.code === 'NOT_FOUND' ? 404 : 409, e.code, e.message);
      }
      throw e;
    }
  });
}
```

- [ ] **Step 6: Run test + typecheck**

Run: `npx vitest run tests/integration/scenario-accept.test.ts && npm run typecheck`
Expected: PASS (2 tests); typecheck clean. (Note: `sessionView.ts` is created in Task 14 — until then this task's typecheck fails on the `mapSessionDetail` import. Implement Task 14's `sessionView.ts` first if executing strictly in order is blocked; the subagent should create the minimal `sessionView.ts` here. See the heads-up below.)

> **Ordering heads-up:** `accept.ts` imports `mapSessionDetail` from `sessionView.ts` (built in Task 14). To keep this task self-contained, create `src/server/scenario/sessionView.ts` now with the implementation shown in Task 14, Step 3, and let Task 14 add only its tests + routes. Commit `sessionView.ts` with this task.

- [ ] **Step 7: Commit**

```bash
git add src/server/scenario/accept.ts src/server/scenario/role.ts src/server/scenario/sessionView.ts src/app/api/scenarios/sessions/[id]/accept/route.ts tests/integration/scenario-accept.test.ts
git commit -m "feat: acceptScenario activates session + generates opening turn"
```

---

### Task 10: runScenarioTurn — non-final per-turn loop (SSE)

**Files:**
- Create: `src/server/scenario/turn.ts`
- Test: `tests/integration/scenario-turn.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/scenario-turn.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runScenarioTurn } from '@/server/scenario/turn';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const U = '__w4_turn_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

async function activeSession(turnsLeft: number) {
  await prisma.user.deleteMany({ where: { username: U } });
  const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
  const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
  await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
  const session = await prisma.scenarioSession.create({
    data: {
      userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'active',
      startedAt: new Date(), state: JSON.stringify({ impression: 5, stress: 'Medium', turnsLeft, turnIndex: 0 }),
    },
  });
  return { user, thread, session };
}

describe('runScenarioTurn (non-final)', () => {
  it('saves the choice, applies the delta, persists a turn, and emits state_update + choices', async () => {
    const { user, session } = await activeSession(4);
    const ollama = {
      chatJson: vi.fn().mockResolvedValue({
        npcReply: 'Good. Why this role?',
        stateDelta: { impression: 2, stress: 'High' },
        isFinalTurn: false,
        suggestedChoicesNext: [
          { id: 'a', text: 'Because I love it', tone: 'Confident', desc: '' },
          { id: 'b', text: 'It pays well', tone: 'Blunt', desc: '' },
        ],
      }),
      embed: vi.fn(),
    };

    const events: SseEvent[] = [];
    for await (const e of runScenarioTurn({ prisma, ollama, userId: user.id, sessionId: session.id, choiceId: 'c1', tone: 'Confident', text: 'I am a developer.' })) {
      events.push(e);
    }

    const names = events.map((e) => e.event);
    expect(names[0]).toBe('user_message_saved');
    expect(names).toContain('message_complete');
    const stateUpdate = events.find((e) => e.event === 'state_update')!.data as { impression: number; turnsLeft: number };
    expect(stateUpdate.impression).toBe(7);
    expect(stateUpdate.turnsLeft).toBe(3);
    expect(names).toContain('choices');
    expect(names).not.toContain('scenario_end');
    expect(names[names.length - 1]).toBe('done');

    const reloaded = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(JSON.parse(reloaded.state).turnsLeft).toBe(3);
    const turn1 = await prisma.scenarioTurn.findUniqueOrThrow({ where: { sessionId_turnIndex: { sessionId: session.id, turnIndex: 1 } } });
    expect(turn1.userChoiceId).toBe('c1');
    expect(turn1.userMessageId).not.toBeNull();
  });

  it('emits an error (not a throw) for a non-active or foreign session', async () => {
    const { user, session } = await activeSession(4);
    await prisma.scenarioSession.update({ where: { id: session.id }, data: { status: 'paused' } });
    const ollama = { chatJson: vi.fn(), embed: vi.fn() };
    const events: SseEvent[] = [];
    for await (const e of runScenarioTurn({ prisma, ollama, userId: user.id, sessionId: session.id, text: 'x' })) events.push(e);
    expect(events.map((e) => e.event)).toContain('error');
    expect(events[events.length - 1].event).toBe('done');
    expect(ollama.chatJson).not.toHaveBeenCalled();
  });

  it('falls back (no throw) and still advances when chatJson fails', async () => {
    const { user, session } = await activeSession(4);
    const ollama = { chatJson: vi.fn().mockRejectedValue(new Error('LLM down')), embed: vi.fn() };
    const events: SseEvent[] = [];
    for await (const e of runScenarioTurn({ prisma, ollama, userId: user.id, sessionId: session.id, text: 'x' })) events.push(e);
    expect(events.map((e) => e.event)).toContain('message_complete');
    expect(events.map((e) => e.event)).toContain('state_update');
    const reloaded = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(JSON.parse(reloaded.state).turnsLeft).toBe(3); // still advanced
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/scenario-turn.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the turn runner**

```ts
// src/server/scenario/turn.ts
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';
import type { SseEvent } from '@/server/sse/events';
import { applyDelta, type ScenarioState, type Stress } from './state';
import { buildScenarioMessages } from './prompt';
import { ScenarioTurnSchema, type ScenarioTurnJson } from './schemas';
import { resolveRole } from './role';
import { runScenarioEnd } from './end';

export interface TurnDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson' | 'embed'>;
  userId: string;
  sessionId: string;
  choiceId?: string;
  tone?: string;
  text?: string;
}

function fallbackTurn(state: ScenarioState): ScenarioTurnJson {
  return {
    npcReply: '(One moment — let me follow up on that.) Could you say a bit more?',
    stateDelta: { impression: 0, stress: state.stress as Stress },
    isFinalTurn: false,
    suggestedChoicesNext: [
      { id: 'fb1', text: 'Sure — let me explain.', tone: 'Reflective', desc: '' },
      { id: 'fb2', text: 'I think I covered it.', tone: 'Confident', desc: '' },
      { id: 'fb3', text: 'Could you clarify the question?', tone: 'Diplomatic', desc: '' },
    ],
  };
}

export async function* runScenarioTurn(deps: TurnDeps): AsyncGenerator<SseEvent> {
  const { prisma, ollama, userId, sessionId } = deps;

  const session = await prisma.scenarioSession.findFirst({
    where: { id: sessionId, userId },
    include: { template: true, npc: true },
  });
  if (!session) {
    yield { event: 'error', data: { code: 'NOT_FOUND', message: 'Scenario session not found' } };
    yield { event: 'done', data: {} };
    return;
  }
  if (session.status !== 'active') {
    yield { event: 'error', data: { code: 'NOT_ACTIVE', message: `session is "${session.status}"` } };
    yield { event: 'done', data: {} };
    return;
  }

  const state = JSON.parse(session.state) as ScenarioState;
  const userText = deps.text ?? deps.choiceId ?? '';

  const userMsg = await prisma.message.create({
    data: {
      threadId: session.threadId, userId, role: 'user', text: userText,
      scenarioSessionId: session.id, meta: JSON.stringify({ choiceId: deps.choiceId, tone: deps.tone }),
    },
  });
  yield { event: 'user_message_saved', data: { messageId: userMsg.id, createdAt: userMsg.createdAt } };
  yield { event: 'typing_start', data: { npcId: session.npcId } };

  const { roleName } = resolveRole(session.npc, session.template);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const history = await prisma.message.findMany({
    where: { scenarioSessionId: session.id, role: { in: ['user', 'npc-roleplay'] } },
    orderBy: { createdAt: 'asc' },
  });
  const messages = buildScenarioMessages({
    roleName,
    instructions: session.template.systemPrompt,
    userLanguage: user?.language ?? 'zh-CN',
    state,
    history: history.map((m) => ({ role: m.role, text: m.text, userId: m.userId })),
  });

  let turn: ScenarioTurnJson;
  try {
    turn = await ollama.chatJson(messages, ScenarioTurnSchema, { options: { temperature: 0.7 } });
  } catch (e) {
    console.error('[scenario] turn generation failed, using fallback', e);
    turn = fallbackTurn(state);
  }

  const stateAfter = applyDelta(state, turn.stateDelta);
  const npcMsg = await prisma.message.create({
    data: {
      threadId: session.threadId, userId: null, role: 'npc-roleplay', text: turn.npcReply,
      scenarioSessionId: session.id, meta: JSON.stringify({ roleplayCharacter: roleName }),
    },
  });
  await prisma.scenarioTurn.create({
    data: {
      sessionId: session.id, turnIndex: stateAfter.turnIndex,
      userChoiceId: deps.choiceId, userChoiceTone: deps.tone,
      userFreeText: deps.text && !deps.choiceId ? deps.text : null,
      userMessageId: userMsg.id, npcMessageId: npcMsg.id,
      stateBefore: JSON.stringify(state), stateAfter: JSON.stringify(stateAfter),
      nextChoices: JSON.stringify(turn.suggestedChoicesNext),
    },
  });
  await prisma.scenarioSession.update({ where: { id: session.id }, data: { state: JSON.stringify(stateAfter) } });

  yield { event: 'typing_end', data: { npcId: session.npcId } };
  yield { event: 'message_complete', data: { messageId: npcMsg.id, fullText: turn.npcReply } };
  yield { event: 'state_update', data: { impression: stateAfter.impression, stress: stateAfter.stress, turnsLeft: stateAfter.turnsLeft } };

  const isFinal = turn.isFinalTurn || stateAfter.turnsLeft <= 0;
  if (!isFinal) {
    yield { event: 'choices', data: { choices: turn.suggestedChoicesNext } };
  } else {
    yield* runScenarioEnd({ prisma, ollama, session, state: stateAfter });
  }

  yield { event: 'done', data: {} };
}
```

> **Ordering heads-up:** `turn.ts` imports `runScenarioEnd` from `end.ts` (Task 13). To run this task's non-final tests in isolation, add a temporary stub `export async function* runScenarioEnd(): AsyncGenerator<import('@/server/sse/events').SseEvent> { yield { event: 'scenario_end', data: {} }; }` in `end.ts`, then replace it with the real implementation in Task 13. The non-final tests here never reach `runScenarioEnd`, so the stub is only needed to satisfy the import/typecheck.

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run tests/integration/scenario-turn.test.ts && npm run typecheck`
Expected: PASS (3 tests); typecheck clean (with the `end.ts` stub in place).

- [ ] **Step 5: Commit**

```bash
git add src/server/scenario/turn.ts src/server/scenario/end.ts tests/integration/scenario-turn.test.ts
git commit -m "feat: runScenarioTurn per-turn JSON loop (non-final path)"
```

---

### Task 11: applyScenarioOutcome — grade → points → stage-up

**Files:**
- Create: `src/server/scenario/relationship.ts`
- Test: `tests/integration/scenario-relationship.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/scenario-relationship.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyScenarioOutcome, gradePoints, stageForPoints } from '@/server/scenario/relationship';

const prisma = new PrismaClient();
const U = '__w4_rel_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('scenario relationship outcome', () => {
  it('maps grades to points and points to stages', () => {
    expect(gradePoints('A+')).toBe(15);
    expect(gradePoints('B')).toBe(8);
    expect(gradePoints('—')).toBe(0);
    expect(stageForPoints(10)).toEqual({ stage: 'acquaintance', stageValue: 1 });
    expect(stageForPoints(35)).toEqual({ stage: 'friend', stageValue: 2 });
    expect(stageForPoints(80)).toEqual({ stage: 'close', stageValue: 3 });
  });

  it('adds points, bumps scenarioCount, and records a RelationshipEvent on stage-up', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const rel = await prisma.relationship.create({
      data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2, relationshipPoints: 65 },
    });

    const change = await applyScenarioOutcome(prisma, user.id, 'lily', 'A', 'Mock Interview');
    expect(change).toEqual({ from: 'friend', to: 'close' });

    const reloaded = await prisma.relationship.findUniqueOrThrow({ where: { id: rel.id } });
    expect(reloaded.relationshipPoints).toBe(77);
    expect(reloaded.stage).toBe('close');
    expect(reloaded.scenarioCount).toBe(1);

    const evt = await prisma.relationshipEvent.findFirst({ where: { relationshipId: rel.id } });
    expect(evt?.fromStage).toBe('friend');
    expect(evt?.toStage).toBe('close');
    expect(evt?.reason).toContain('Mock Interview');
  });

  it('returns null (no event) when the stage does not change', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const change = await applyScenarioOutcome(prisma, user.id, 'lily', 'C', 'Mock Interview');
    expect(change).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/scenario-relationship.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/scenario/relationship.ts
import type { PrismaClient } from '@prisma/client';

const GRADE_POINTS: Record<string, number> = {
  'A+': 15, A: 12, 'A-': 10, 'B+': 9, B: 8, 'B-': 6, C: 3, '—': 0,
};

export function gradePoints(grade: string): number {
  return GRADE_POINTS[grade] ?? 0;
}

export function stageForPoints(points: number): { stage: string; stageValue: number } {
  if (points >= 70) return { stage: 'close', stageValue: 3 };
  if (points >= 30) return { stage: 'friend', stageValue: 2 };
  return { stage: 'acquaintance', stageValue: 1 };
}

// Applies a completed scenario's grade to the relationship: add points, recompute stage,
// record a RelationshipEvent on a stage-up. Returns the stage change for the SSE payload, or null.
// (W4 owns only the scenario-outcome recompute; general per-message progression is W5.)
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/scenario-relationship.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/scenario/relationship.ts tests/integration/scenario-relationship.test.ts
git commit -m "feat: applyScenarioOutcome (grade points + stage-up event)"
```

---

### Task 12: generateMemoryCard (W3 deferral lands here)

**Files:**
- Create: `src/server/memory/memoryCard.ts`
- Test: `tests/integration/memory-card.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/memory-card.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { generateMemoryCard } from '@/server/memory/memoryCard';

const prisma = new PrismaClient();
const U = '__w4_memcard_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('generateMemoryCard', () => {
  it('creates a scenario Memory card from the transcript', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const ollama = {
      chatJson: vi.fn().mockResolvedValue({ title: 'Composed Under Pressure', body: 'Stayed calm and structured answers when challenged.' }),
      embed: vi.fn(),
    };

    const mem = await generateMemoryCard({
      prisma, ollama, userId: user.id, npcId: 'lily', sessionId: 'sess_x',
      transcript: 'NPC: Why this role?\nUser: Because I value the mission.', grade: 'A',
    });

    expect(mem).not.toBeNull();
    expect(mem!.title).toBe('Composed Under Pressure');
    expect(mem!.sourceType).toBe('scenario');
    expect(mem!.sourceRef).toBe('sess_x');
    expect(mem!.npcId).toBe('lily');

    const surfaced = await prisma.memory.findMany({ where: { userId: user.id, dismissedAt: null } });
    expect(surfaced).toHaveLength(1);
  });

  it('returns null (never throws) when the LLM fails', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const ollama = { chatJson: vi.fn().mockRejectedValue(new Error('down')), embed: vi.fn() };
    const mem = await generateMemoryCard({ prisma, ollama, userId: user.id, npcId: 'lily', sessionId: 's2', transcript: 'x', grade: 'B' });
    expect(mem).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/memory-card.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/memory/memoryCard.ts
import type { Memory, PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';
import { MemoryCardSchema } from '@/server/scenario/schemas';

export interface MemoryCardDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson'>;
  userId: string;
  npcId: string;
  sessionId: string;
  transcript: string;
  grade: string;
}

// Distils one durable, human insight about the user from a finished scenario into a Memory card.
// Guarded: returns null on any failure (memory generation must never break the end flow).
export async function generateMemoryCard(deps: MemoryCardDeps): Promise<Memory | null> {
  try {
    const card = await deps.ollama.chatJson(
      [
        {
          role: 'system',
          content:
            'You observed a roleplay between an NPC and a language learner. Distil ONE durable, human insight about the learner ' +
            'into a memory card. Return JSON {"title": short label like "Polite Disagree-er", "body": a warm 1-2 sentence observation}.',
        },
        { role: 'user', content: `Transcript:\n${deps.transcript}\n\nGrade: ${deps.grade}` },
      ],
      MemoryCardSchema,
    );
    return await deps.prisma.memory.create({
      data: {
        userId: deps.userId,
        title: card.title,
        body: card.body,
        npcId: deps.npcId,
        sourceType: 'scenario',
        sourceRef: deps.sessionId,
      },
    });
  } catch (e) {
    console.error('[memory] generateMemoryCard failed', e);
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/memory-card.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/memory/memoryCard.ts tests/integration/memory-card.test.ts
git commit -m "feat: generateMemoryCard — scenario memory card (W3 deferral)"
```

---

### Task 13: runScenarioEnd — graded summary + payoff

**Files:**
- Modify: `src/server/scenario/end.ts` (replace the Task-10 stub with the real implementation)
- Test: `tests/integration/scenario-end.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/scenario-end.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runScenarioEnd } from '@/server/scenario/end';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const U = '__w4_end_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('runScenarioEnd', () => {
  it('writes summary + memory card, applies the grade, completes the session, emits scenario_end', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2, relationshipPoints: 65 } });
    const session = await prisma.scenarioSession.create({
      data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'active', startedAt: new Date(), state: '{}' },
      include: { template: true, npc: true },
    });
    await prisma.message.create({ data: { threadId: thread.id, userId: null, role: 'npc-roleplay', text: 'Why this role?', scenarioSessionId: session.id } });
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'I value the mission.', scenarioSessionId: session.id } });

    const ollama = {
      chatJson: vi.fn()
        .mockResolvedValueOnce({ grade: 'A', languageNote: 'Clear sentences.', pragmaticsNote: 'Polite hedging.', relationshipNote: 'Warmer rapport.' })
        .mockResolvedValueOnce({ title: 'Mission-Driven', body: 'Frames answers around purpose.' }),
      embed: vi.fn(),
    };

    const events: SseEvent[] = [];
    for await (const e of runScenarioEnd({ prisma, ollama, session, state: { impression: 8, stress: 'Low', turnsLeft: 0, turnIndex: 6 } })) {
      events.push(e);
    }

    const end = events.find((e) => e.event === 'scenario_end')!.data as { summary: { grade: string }; memoryId: string | null; relationshipChange: unknown };
    expect(end.summary.grade).toBe('A');
    expect(end.memoryId).toBeTruthy();
    expect(end.relationshipChange).toEqual({ from: 'friend', to: 'close' });

    const reloaded = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(reloaded.status).toBe('completed');
    expect(reloaded.endedAt).not.toBeNull();
    expect(await prisma.scenarioSummary.count({ where: { sessionId: session.id } })).toBe(1);
    expect(await prisma.message.count({ where: { scenarioSessionId: session.id, role: 'summary' } })).toBe(1);
    expect(await prisma.activityEvent.count({ where: { userId: user.id, type: 'scenario_completed' } })).toBe(1);
  });

  it('falls back to grade "—" and still completes when the summary LLM fails', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const thread = await prisma.thread.findFirstOrThrow({ where: { userId: user.id, npcId: 'lily' } });
    const session = await prisma.scenarioSession.create({
      data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'active', startedAt: new Date(), state: '{}' },
      include: { template: true, npc: true },
    });
    const ollama = { chatJson: vi.fn().mockRejectedValue(new Error('down')), embed: vi.fn() };
    const events: SseEvent[] = [];
    for await (const e of runScenarioEnd({ prisma, ollama, session, state: { impression: 5, stress: 'Medium', turnsLeft: 0, turnIndex: 6 } })) events.push(e);
    const end = events.find((e) => e.event === 'scenario_end')!.data as { summary: { grade: string } };
    expect(end.summary.grade).toBe('—');
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('completed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/scenario-end.test.ts`
Expected: FAIL — `runScenarioEnd` is still the Task-10 stub (no summary/memory/scenario_end payload).

- [ ] **Step 3: Replace the stub with the real implementation**

```ts
// src/server/scenario/end.ts
import type { PrismaClient, ScenarioSession, ScenarioTemplate, Npc } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';
import type { SseEvent } from '@/server/sse/events';
import type { ScenarioState } from './state';
import { ScenarioSummarySchema, type ScenarioSummaryJson } from './schemas';
import { applyScenarioOutcome } from './relationship';
import { generateMemoryCard } from '@/server/memory/memoryCard';

const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', '—'];

export function normalizeGrade(raw: string): string {
  const g = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (GRADES.includes(g)) return g;
  const letter = g[0];
  if (letter === 'A' || letter === 'B' || letter === 'C') return letter;
  return '—';
}

export interface EndDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson' | 'embed'>;
  session: ScenarioSession & { template: ScenarioTemplate; npc: Npc };
  state: ScenarioState;
}

export async function* runScenarioEnd(deps: EndDeps): AsyncGenerator<SseEvent> {
  const { prisma, ollama, session } = deps;

  const history = await prisma.message.findMany({
    where: { scenarioSessionId: session.id, role: { in: ['user', 'npc-roleplay'] } },
    orderBy: { createdAt: 'asc' },
  });
  const transcript = history.map((m) => `${m.userId ? 'User' : 'NPC'}: ${m.text}`).join('\n');

  let summary: ScenarioSummaryJson;
  try {
    summary = await ollama.chatJson(
      [
        {
          role: 'system',
          content:
            'You are an English-coaching evaluator. Grade the learner\'s performance in this roleplay. ' +
            'Return JSON {"grade": one of "A+","A","A-","B+","B","B-","C","—"; ' +
            '"languageNote": string; "pragmaticsNote": string; "relationshipNote": string}. ' +
            'Each note is 1-2 encouraging, specific sentences.',
        },
        { role: 'user', content: transcript },
      ],
      ScenarioSummarySchema,
    );
  } catch (e) {
    console.error('[scenario] summary generation failed, using fallback', e);
    summary = { grade: '—', languageNote: 'Summary unavailable.', pragmaticsNote: '', relationshipNote: '' };
  }
  const grade = normalizeGrade(summary.grade);

  await prisma.scenarioSummary.create({
    data: {
      sessionId: session.id, grade,
      languageNote: summary.languageNote, pragmaticsNote: summary.pragmaticsNote, relationshipNote: summary.relationshipNote,
    },
  });
  await prisma.message.create({
    data: {
      threadId: session.threadId, userId: null, role: 'summary',
      text: [summary.languageNote, summary.pragmaticsNote, summary.relationshipNote].filter(Boolean).join('\n'),
      scenarioSessionId: session.id, meta: JSON.stringify({ summarySessionId: session.id, grade }),
    },
  });

  const memory = await generateMemoryCard({
    prisma, ollama, userId: session.userId, npcId: session.npcId, sessionId: session.id, transcript, grade,
  });
  const relationshipChange = await applyScenarioOutcome(prisma, session.userId, session.npcId, grade, session.template.title);

  await prisma.activityEvent.create({
    data: { userId: session.userId, type: 'scenario_completed', payload: JSON.stringify({ sessionId: session.id, grade }) },
  });
  await prisma.scenarioSession.update({ where: { id: session.id }, data: { status: 'completed', endedAt: new Date() } });

  yield {
    event: 'scenario_end',
    data: {
      summary: { grade, languageNote: summary.languageNote, pragmaticsNote: summary.pragmaticsNote, relationshipNote: summary.relationshipNote },
      memoryId: memory?.id ?? null,
      relationshipChange,
    },
  };
}
```

- [ ] **Step 4: Run the end test + the turn regression suite + typecheck**

Run: `npx vitest run tests/integration/scenario-end.test.ts tests/integration/scenario-turn.test.ts && npm run typecheck`
Expected: PASS; typecheck clean (the real `runScenarioEnd` now satisfies the `turn.ts` import).

- [ ] **Step 5: Commit**

```bash
git add src/server/scenario/end.ts tests/integration/scenario-end.test.ts
git commit -m "feat: runScenarioEnd — graded summary + memory card + stage-up payoff"
```

---

### Task 14: Session view mappers + read routes (catalog / list / detail)

**Files:**
- Create: `src/server/scenario/sessionView.ts` (committed earlier in Task 9; this task adds its unit test)
- Create: `src/app/api/scenarios/catalog/route.ts`
- Create: `src/app/api/scenarios/sessions/route.ts`
- Create: `src/app/api/scenarios/sessions/[id]/route.ts`
- Test: `tests/unit/scenario-view.test.ts`, `tests/integration/scenario-read-routes.test.ts`

- [ ] **Step 1: Write the failing unit test for the mappers**

```ts
// tests/unit/scenario-view.test.ts
import { describe, it, expect } from 'vitest';
import { mapSessionListItem, mapSessionDetail } from '@/server/scenario/sessionView';

const base = {
  id: 's1', npcId: 'lily', status: 'completed', state: JSON.stringify({ impression: 8, stress: 'Low', turnsLeft: 0, turnIndex: 6 }),
  invitedAt: new Date('2026-05-01'), startedAt: new Date('2026-05-02'), endedAt: new Date('2026-05-03'),
  triggerRationale: JSON.stringify({ topicMatch: 'interview' }),
  template: { id: 'mock_interview', title: 'Mock Interview', titleZh: '模拟面试' },
  summary: { grade: 'A' },
};

describe('scenario view mappers', () => {
  it('maps a list item with title + grade', () => {
    expect(mapSessionListItem(base)).toEqual({
      id: 's1', scenarioTitle: 'Mock Interview', npcId: 'lily', status: 'completed', grade: 'A', startedAt: base.startedAt,
    });
  });

  it('maps a detail with parsed state + transcript', () => {
    const d = mapSessionDetail({ ...base, summary: null }, [
      { id: 'm1', role: 'npc-roleplay', text: 'Why this role?', userId: null, meta: null, createdAt: base.startedAt },
      { id: 'm2', role: 'user', text: 'I value the mission.', userId: 'u1', meta: JSON.stringify({ choiceId: 'c1' }), createdAt: base.endedAt },
    ]);
    expect(d.state).toEqual({ impression: 8, stress: 'Low', turnsLeft: 0, turnIndex: 6 });
    expect(d.session.grade).toBeNull();
    expect(d.transcript).toHaveLength(2);
    expect(d.transcript[0].from).toBe('npc');
    expect(d.transcript[1].meta).toEqual({ choiceId: 'c1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scenario-view.test.ts`
Expected: FAIL — module not found (or, if Task 9 already created `sessionView.ts`, the test asserts the exact shapes below).

- [ ] **Step 3: Write `sessionView.ts`** (this is the implementation Task 9 referenced)

```ts
// src/server/scenario/sessionView.ts
interface TemplateLite { id: string; title: string; titleZh: string | null }

interface SessionRow {
  id: string;
  npcId: string;
  status: string;
  state: string;
  invitedAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  triggerRationale: string | null;
  template: TemplateLite;
  summary?: { grade: string } | null;
}

interface MessageRow {
  id: string;
  role: string;
  text: string;
  userId: string | null;
  meta: string | null;
  createdAt: Date;
}

export interface SessionListItem {
  id: string;
  scenarioTitle: string;
  npcId: string;
  status: string;
  grade: string | null;
  startedAt: Date | null;
}

export interface SessionDetail {
  session: {
    id: string;
    npcId: string;
    scenarioTitle: string;
    titleZh: string | null;
    status: string;
    grade: string | null;
    invitedAt: Date;
    startedAt: Date | null;
    endedAt: Date | null;
    rationale: unknown;
  };
  transcript: { id: string; role: string; from: 'user' | 'npc'; text: string; meta: unknown; createdAt: Date }[];
  state: unknown;
}

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function mapSessionListItem(s: SessionRow): SessionListItem {
  return {
    id: s.id,
    scenarioTitle: s.template.title,
    npcId: s.npcId,
    status: s.status,
    grade: s.summary?.grade ?? null,
    startedAt: s.startedAt,
  };
}

export function mapSessionDetail(s: SessionRow, messages: MessageRow[]): SessionDetail {
  return {
    session: {
      id: s.id,
      npcId: s.npcId,
      scenarioTitle: s.template.title,
      titleZh: s.template.titleZh,
      status: s.status,
      grade: s.summary?.grade ?? null,
      invitedAt: s.invitedAt,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      rationale: safeParse(s.triggerRationale),
    },
    transcript: messages.map((m) => ({
      id: m.id,
      role: m.role,
      from: m.userId ? 'user' : 'npc',
      text: m.text,
      meta: safeParse(m.meta),
      createdAt: m.createdAt,
    })),
    state: safeParse(s.state),
  };
}
```

- [ ] **Step 4: Write the read routes**

```ts
// src/app/api/scenarios/catalog/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';
import { STAGE_VALUE } from '@/server/scenario/trigger';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const templates = await prisma.scenarioTemplate.findMany({ where: { enabled: true } });
    const rels = await prisma.relationship.findMany({ where: { userId } });
    const stageByNpc = new Map(rels.map((r) => [r.npcId, r.stageValue]));

    return json(
      templates.map((t) => ({
        id: t.id,
        title: t.title,
        titleZh: t.titleZh,
        npcId: t.npcId,
        minStage: t.minStage,
        estimatedMinutes: t.estimatedMinutes,
        registerTags: JSON.parse(t.registerTags),
        eligible: (stageByNpc.get(t.npcId) ?? 1) >= (STAGE_VALUE[t.minStage] ?? 99),
      })),
    );
  });
}
```

```ts
// src/app/api/scenarios/sessions/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';
import { mapSessionListItem } from '@/server/scenario/sessionView';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const url = new URL(req.url);
    const npcId = url.searchParams.get('npcId') ?? undefined;
    const status = url.searchParams.get('status') ?? undefined;

    const rows = await prisma.scenarioSession.findMany({
      where: { userId, ...(npcId ? { npcId } : {}), ...(status ? { status } : {}) },
      include: { template: true, summary: true },
      orderBy: { invitedAt: 'desc' },
    });
    return json(rows.map(mapSessionListItem));
  });
}
```

```ts
// src/app/api/scenarios/sessions/[id]/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { mapSessionDetail } from '@/server/scenario/sessionView';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const session = await prisma.scenarioSession.findFirst({
      where: { id: params.id, userId },
      include: { template: true, summary: true },
    });
    if (!session) return errorJson(404, 'NOT_FOUND', 'Scenario session not found');

    const messages = await prisma.message.findMany({
      where: { scenarioSessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });
    return json(mapSessionDetail(session, messages));
  });
}
```

- [ ] **Step 5: Write the read-routes integration test**

```ts
// tests/integration/scenario-read-routes.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET as catalogGET } from '@/app/api/scenarios/catalog/route';
import { GET as listGET } from '@/app/api/scenarios/sessions/route';
import { GET as detailGET } from '@/app/api/scenarios/sessions/[id]/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w4_readroutes_user__';

function reqAs(userId: string, url = 'http://test/local'): Request {
  return new Request(url, { headers: { cookie: `${SESSION_COOKIE}=${userId}` } });
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('scenario read routes', () => {
  it('catalog marks eligibility by stage; sessions list + detail are user-scoped', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
    const session = await prisma.scenarioSession.create({
      data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'invited' },
    });

    const catalog = (await (await catalogGET(reqAs(user.id))).json()) as { id: string; eligible: boolean }[];
    expect(catalog.find((c) => c.id === 'mock_interview')?.eligible).toBe(true);

    const list = (await (await listGET(reqAs(user.id))).json()) as { id: string; scenarioTitle: string }[];
    expect(list.some((s) => s.id === session.id && s.scenarioTitle === 'Mock Interview')).toBe(true);

    const detailRes = await detailGET(reqAs(user.id), { params: { id: session.id } });
    expect(detailRes.status).toBe(200);

    // isolation: a foreign user gets 404 on the detail and an empty list
    const stranger = await prisma.user.create({ data: { username: U + '_x', password: 'pw' } });
    const foreign = await detailGET(reqAs(stranger.id), { params: { id: session.id } });
    expect(foreign.status).toBe(404);
    const strangerList = (await (await listGET(reqAs(stranger.id))).json()) as unknown[];
    expect(strangerList).toHaveLength(0);
    await prisma.user.deleteMany({ where: { username: U + '_x' } });
  });
});
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run tests/unit/scenario-view.test.ts tests/integration/scenario-read-routes.test.ts && npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/scenarios/catalog/route.ts src/app/api/scenarios/sessions/route.ts "src/app/api/scenarios/sessions/[id]/route.ts" tests/unit/scenario-view.test.ts tests/integration/scenario-read-routes.test.ts
git commit -m "feat: scenario read routes (catalog / sessions list / detail)"
```

> If `sessionView.ts` was not committed in Task 9, also `git add src/server/scenario/sessionView.ts` here.

---

### Task 15: Lifecycle services + routes (decline / pause / resume / abort) and SSE turn routes

**Files:**
- Create: `src/server/scenario/lifecycle.ts`
- Create: `src/app/api/scenarios/sessions/[id]/decline/route.ts`
- Create: `src/app/api/scenarios/sessions/[id]/pause/route.ts`
- Create: `src/app/api/scenarios/sessions/[id]/resume/route.ts`
- Create: `src/app/api/scenarios/sessions/[id]/abort/route.ts`
- Create: `src/app/api/scenarios/sessions/[id]/choose/route.ts`
- Create: `src/app/api/scenarios/sessions/[id]/freetype/route.ts`
- Test: `tests/integration/scenario-lifecycle.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/scenario-lifecycle.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { declineScenario, pauseScenario, resumeScenario, abortScenario } from '@/server/scenario/lifecycle';
import { ScenarioError } from '@/server/scenario/accept';

const prisma = new PrismaClient();
const U = '__w4_lifecycle_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

async function session(status: string) {
  const user = await prisma.user.upsert({ where: { username: U }, create: { username: U, password: 'pw' }, update: {} });
  const thread = await prisma.thread.upsert({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } }, create: { userId: user.id, npcId: 'lily' }, update: {} });
  await prisma.relationship.upsert({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } }, create: { userId: user.id, npcId: 'lily' }, update: {} });
  const s = await prisma.scenarioSession.create({ data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status } });
  return { user, session: s };
}

describe('scenario lifecycle', () => {
  it('decline records reason + bumps declineCount; only from invited', async () => {
    const { user, session: s } = await session('invited');
    await declineScenario({ prisma, userId: user.id, sessionId: s.id, reason: 'busy' });
    const reloaded = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(reloaded.status).toBe('declined');
    expect(reloaded.declineReason).toBe('busy');
    const rel = await prisma.relationship.findUniqueOrThrow({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel.declineCount).toBe(1);

    const active = await session('active');
    await expect(declineScenario({ prisma, userId: active.user.id, sessionId: active.session.id })).rejects.toBeInstanceOf(ScenarioError);
  });

  it('pause/resume round-trip; abort terminates a non-terminal session', async () => {
    const { user, session: s } = await session('active');
    await pauseScenario({ prisma, userId: user.id, sessionId: s.id });
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('paused');
    await resumeScenario({ prisma, userId: user.id, sessionId: s.id });
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('active');
    await abortScenario({ prisma, userId: user.id, sessionId: s.id });
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('aborted');
  });

  it('rejects a foreign session id (isolation)', async () => {
    const { session: s } = await session('invited');
    await expect(declineScenario({ prisma, userId: 'stranger', sessionId: s.id })).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/scenario-lifecycle.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the lifecycle service**

```ts
// src/server/scenario/lifecycle.ts
import type { PrismaClient } from '@prisma/client';
import { canTransition } from './transitions';
import { ScenarioError } from './accept';

interface LifecycleDeps {
  prisma: PrismaClient;
  userId: string;
  sessionId: string;
  reason?: string;
}

async function ownedSession(prisma: PrismaClient, userId: string, sessionId: string) {
  const s = await prisma.scenarioSession.findFirst({ where: { id: sessionId, userId } });
  if (!s) throw new ScenarioError('NOT_FOUND', 'Scenario session not found');
  return s;
}

function assertTransition(from: string, to: string) {
  if (!canTransition(from, to)) throw new ScenarioError('CONFLICT', `cannot move from "${from}" to "${to}"`);
}

export async function declineScenario(deps: LifecycleDeps): Promise<void> {
  const s = await ownedSession(deps.prisma, deps.userId, deps.sessionId);
  assertTransition(s.status, 'declined');
  await deps.prisma.scenarioSession.update({
    where: { id: s.id },
    data: { status: 'declined', declineReason: deps.reason ?? null, endedAt: new Date() },
  });
  await deps.prisma.relationship.updateMany({
    where: { userId: deps.userId, npcId: s.npcId },
    data: { declineCount: { increment: 1 } },
  });
  await deps.prisma.activityEvent.create({
    data: { userId: deps.userId, type: 'scenario_declined', payload: JSON.stringify({ sessionId: s.id }) },
  });
}

export async function pauseScenario(deps: LifecycleDeps): Promise<void> {
  const s = await ownedSession(deps.prisma, deps.userId, deps.sessionId);
  assertTransition(s.status, 'paused');
  await deps.prisma.scenarioSession.update({ where: { id: s.id }, data: { status: 'paused' } });
}

export async function resumeScenario(deps: LifecycleDeps): Promise<void> {
  const s = await ownedSession(deps.prisma, deps.userId, deps.sessionId);
  assertTransition(s.status, 'active');
  await deps.prisma.scenarioSession.update({ where: { id: s.id }, data: { status: 'active' } });
}

export async function abortScenario(deps: LifecycleDeps): Promise<void> {
  const s = await ownedSession(deps.prisma, deps.userId, deps.sessionId);
  assertTransition(s.status, 'aborted');
  await deps.prisma.scenarioSession.update({ where: { id: s.id }, data: { status: 'aborted', endedAt: new Date() } });
}
```

- [ ] **Step 4: Write the four JSON lifecycle routes**

```ts
// src/app/api/scenarios/sessions/[id]/decline/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { declineScenario } from '@/server/scenario/lifecycle';
import { ScenarioError } from '@/server/scenario/accept';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    try {
      await declineScenario({ prisma, userId, sessionId: params.id, reason: body.reason });
      return json({ ok: true });
    } catch (e) {
      if (e instanceof ScenarioError) return errorJson(e.code === 'NOT_FOUND' ? 404 : 409, e.code, e.message);
      throw e;
    }
  });
}
```

```ts
// src/app/api/scenarios/sessions/[id]/pause/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { pauseScenario } from '@/server/scenario/lifecycle';
import { ScenarioError } from '@/server/scenario/accept';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    try {
      await pauseScenario({ prisma, userId, sessionId: params.id });
      return json({ ok: true });
    } catch (e) {
      if (e instanceof ScenarioError) return errorJson(e.code === 'NOT_FOUND' ? 404 : 409, e.code, e.message);
      throw e;
    }
  });
}
```

```ts
// src/app/api/scenarios/sessions/[id]/resume/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { resumeScenario } from '@/server/scenario/lifecycle';
import { ScenarioError } from '@/server/scenario/accept';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    try {
      await resumeScenario({ prisma, userId, sessionId: params.id });
      const session = await prisma.scenarioSession.findFirst({ where: { id: params.id, userId } });
      return json({ session });
    } catch (e) {
      if (e instanceof ScenarioError) return errorJson(e.code === 'NOT_FOUND' ? 404 : 409, e.code, e.message);
      throw e;
    }
  });
}
```

```ts
// src/app/api/scenarios/sessions/[id]/abort/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { abortScenario } from '@/server/scenario/lifecycle';
import { ScenarioError } from '@/server/scenario/accept';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    try {
      await abortScenario({ prisma, userId, sessionId: params.id });
      return json({ ok: true });
    } catch (e) {
      if (e instanceof ScenarioError) return errorJson(e.code === 'NOT_FOUND' ? 404 : 409, e.code, e.message);
      throw e;
    }
  });
}
```

- [ ] **Step 5: Write the two SSE turn routes**

```ts
// src/app/api/scenarios/sessions/[id]/choose/route.ts
import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { errorJson } from '@/server/http/respond';
import { requireUser } from '@/server/auth/requireUser';
import { sseResponse } from '@/server/sse/events';
import { OllamaClient } from '@/server/llm/ollama';
import { runScenarioTurn } from '@/server/scenario/turn';

export const dynamic = 'force-dynamic';

const Body = z.object({ choiceId: z.string().min(1), tone: z.string().optional(), text: z.string().optional() });

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  let userId: string;
  try { userId = requireUser(req).userId; } catch { return errorJson(401, 'UNAUTHORIZED', 'Sign in required'); }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'choiceId is required');

  return sseResponse(
    runScenarioTurn({
      prisma, ollama: new OllamaClient(), userId, sessionId: params.id,
      choiceId: parsed.data.choiceId, tone: parsed.data.tone, text: parsed.data.text,
    }),
  );
}
```

```ts
// src/app/api/scenarios/sessions/[id]/freetype/route.ts
import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { errorJson } from '@/server/http/respond';
import { requireUser } from '@/server/auth/requireUser';
import { sseResponse } from '@/server/sse/events';
import { OllamaClient } from '@/server/llm/ollama';
import { runScenarioTurn } from '@/server/scenario/turn';

export const dynamic = 'force-dynamic';

const Body = z.object({ text: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  let userId: string;
  try { userId = requireUser(req).userId; } catch { return errorJson(401, 'UNAUTHORIZED', 'Sign in required'); }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'text is required');

  return sseResponse(runScenarioTurn({ prisma, ollama: new OllamaClient(), userId, sessionId: params.id, text: parsed.data.text }));
}
```

- [ ] **Step 6: Run test + typecheck**

Run: `npx vitest run tests/integration/scenario-lifecycle.test.ts && npm run typecheck`
Expected: PASS (3 tests); typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/server/scenario/lifecycle.ts "src/app/api/scenarios/sessions/[id]/decline/route.ts" "src/app/api/scenarios/sessions/[id]/pause/route.ts" "src/app/api/scenarios/sessions/[id]/resume/route.ts" "src/app/api/scenarios/sessions/[id]/abort/route.ts" "src/app/api/scenarios/sessions/[id]/choose/route.ts" "src/app/api/scenarios/sessions/[id]/freetype/route.ts" tests/integration/scenario-lifecycle.test.ts
git commit -m "feat: scenario lifecycle services + decline/pause/resume/abort + SSE choose/freetype routes"
```

---

### Task 16: End-to-end A→B→C→D + master-plan update

**Files:**
- Test: `tests/integration/scenario-e2e.test.ts`
- Modify: `docs/superpowers/plans/2026-05-25-backend-overall-plan.md` (mark W4 done)

- [ ] **Step 1: Write the end-to-end test**

```ts
// tests/integration/scenario-e2e.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OllamaClient } from '@/server/llm/ollama';
import { streamChat } from '@/server/chat/streamChat';
import { acceptScenario } from '@/server/scenario/accept';
import { runScenarioTurn } from '@/server/scenario/turn';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const U = '__w4_e2e_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

function ndjson(lines: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const l of lines) c.enqueue(enc.encode(l + '\n')); c.close(); } });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe('scenario A→B→C→D end to end', () => {
  it('offers → accepts → runs a final turn → grades, cards, and levels up the relationship', async () => {
    // ---- A: a friend who has warmed up the thread, just below the "close" threshold ----
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2, relationshipPoints: 65 } });
    for (let i = 0; i < 4; i++) await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: `warmup ${i}` } });

    // ---- B: casual turn mentioning "interview" → scenario_offer ----
    const chatFetch = vi.fn(async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      if (b.stream === true) return ndjson([JSON.stringify({ message: { content: "sure, let's!" }, done: true })]);
      return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ facts: [] }) } }) } as unknown as Response;
    });
    const chatOllama = new OllamaClient({ fetchImpl: chatFetch as unknown as typeof fetch });

    const bEvents: SseEvent[] = [];
    for await (const e of streamChat({ prisma, ollama: chatOllama, userId: user.id, npcId: 'lily', text: 'can we run a mock interview?' })) bEvents.push(e);
    const offer = bEvents.find((e) => e.event === 'scenario_offer')!.data as { sessionId: string };
    expect(offer.sessionId).toBeTruthy();

    // ---- C: accept → opening, then one final turn ----
    const scenarioOllama = {
      chatJson: vi.fn()
        .mockResolvedValueOnce({ npcReply: 'Welcome. Tell me about yourself.', stateDelta: { impression: 0, stress: 'Medium' }, isFinalTurn: false, suggestedChoicesNext: [{ id: 'c1', text: 'I am a developer.', tone: 'Confident', desc: '' }] })
        .mockResolvedValueOnce({ npcReply: 'Great, thank you — that concludes our interview.', stateDelta: { impression: 2, stress: 'Low' }, isFinalTurn: true, suggestedChoicesNext: [] })
        .mockResolvedValueOnce({ grade: 'A', languageNote: 'Clear, structured answers.', pragmaticsNote: 'Polite and composed.', relationshipNote: 'Built genuine rapport.' })
        .mockResolvedValueOnce({ title: 'Composed Under Pressure', body: 'Keeps answers structured and calm when challenged.' }),
      embed: vi.fn(),
    };

    const accept = await acceptScenario({ prisma, ollama: scenarioOllama, userId: user.id, sessionId: offer.sessionId });
    expect(accept.session.status).toBe('active');
    expect(accept.openingMessage.text).toContain('Welcome');

    const dEvents: SseEvent[] = [];
    for await (const e of runScenarioTurn({ prisma, ollama: scenarioOllama, userId: user.id, sessionId: offer.sessionId, choiceId: 'c1', tone: 'Confident', text: 'I am a developer who values impact.' })) dEvents.push(e);

    // ---- D: payoff ----
    const end = dEvents.find((e) => e.event === 'scenario_end')!.data as { summary: { grade: string }; memoryId: string | null; relationshipChange: { from: string; to: string } | null };
    expect(end.summary.grade).toBe('A');
    expect(end.memoryId).toBeTruthy();
    expect(end.relationshipChange).toEqual({ from: 'friend', to: 'close' });

    const session = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: offer.sessionId } });
    expect(session.status).toBe('completed');
    expect(await prisma.scenarioSummary.count({ where: { sessionId: session.id } })).toBe(1);
    const memCard = await prisma.memory.findFirst({ where: { userId: user.id, sourceType: 'scenario', sourceRef: session.id } });
    expect(memCard?.title).toBe('Composed Under Pressure');
    const rel = await prisma.relationship.findUniqueOrThrow({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel.stage).toBe('close');
    expect(rel.relationshipPoints).toBe(77);
    expect(await prisma.activityEvent.count({ where: { userId: user.id, type: 'scenario_completed' } })).toBe(1);
  });
});
```

- [ ] **Step 2: Run the e2e test**

Run: `npx vitest run tests/integration/scenario-e2e.test.ts`
Expected: PASS (1 test). This is the W4 "Done when: A→B→C→D 跑通" gate.

- [ ] **Step 3: Run the FULL suite + typecheck (regression gate)**

Run: `npm run test && npm run typecheck`
Expected: every test green (W1–W4) and typecheck clean. If a W2/W3 stream test regressed, the offer wiring (Task 7) is firing when it should not — re-confirm those threads are `acquaintance` with no topic keyword.

- [ ] **Step 4: Update the master plan W4 row**

In `docs/superpowers/plans/2026-05-25-backend-overall-plan.md`, change the W4 row (currently `| **W4** | … | A→B→C→D runs |`) to mark it done, matching the W2/W3 style:

```markdown
| **W4** ✅ | `2026-05-26-backend-w4-scenario.md` | **Scenario Orchestrator** — Mock Interview end-to-end | W3 | §五(5),七(M4),十(B) | **DONE** — deterministic B3 `triggerJudge` (stage + warmed-up thread + topic keyword) → `scenario_offer` from `streamChat` (guarded); `accept` → opening roleplay turn; per-turn forced-JSON loop (`runScenarioTurn`) drives `state_update` (impression/stress/turnsLeft) + `choices`, with a graceful fallback turn on LLM failure; end flow grades the session, writes `ScenarioSummary` + a `generateMemoryCard` `Memory`, applies `applyScenarioOutcome` (points → stage-up + `RelationshipEvent`), emits `scenario_end`; full catalog/list/detail + accept/decline/pause/resume/abort + SSE choose/freetype routes. A→B→C→D e2e green. **Deferred:** general per-message Relationship/Progression + Achievement engine → W5 (W4 emits `scenario_accepted`/`scenario_completed` ActivityEvents for it); grammar correction + suggestion chips → W5/W6; 2nd scenario template → W8. |
```

- [ ] **Step 5: Commit**

```bash
git add tests/integration/scenario-e2e.test.ts docs/superpowers/plans/2026-05-25-backend-overall-plan.md
git commit -m "test: scenario A->B->C->D end-to-end; mark W4 done in master plan"
```

---

## Self-Review (run after the plan, before execution)

**1. Spec coverage (§五(5), §七 M4, §十 workflow B):**
- triggerJudge (stage + turn count + topic match + cooldown + rationale) → Task 4. ✅
- generateInvitation + `ScenarioSession(invited)` + `scenario_offer` → Tasks 5–7. ✅ (LLM-authored copy deferred; deterministic NPC-voice text used.)
- State machine invited→accepted→active→paused⇄active→completed + declined/aborted → Tasks 2, 9, 13, 15. ✅
- Per-turn forced-JSON loop `{ npcReply, stateDelta, isFinalTurn, suggestedChoicesNext }` + state + `ScenarioTurn` + token/state_update/choices → Tasks 3, 8, 10. ✅ (per-token streaming deferred; one `message_complete` emitted.)
- End flow: summary (grade + 3 notes) + `ScenarioSummary` + `generateMemoryCard` + `applyScenarioOutcome` + `scenario_end` → Tasks 11–13. ✅
- All §五(5) routes (catalog, sessions, detail, accept, decline, choose, freetype, pause, resume, abort) → Tasks 9, 14, 15. ✅
- SSE event names match §六 (`user_message_saved · typing_start/end · message_complete · state_update · choices · scenario_end · scenario_offer · error · done`). ✅

**2. Placeholder scan:** No `TBD`/`handle edge cases`/"similar to Task N" — every code step is complete. ✅

**3. Type consistency:**
- `ScenarioState { impression, stress, turnsLeft, turnIndex }` consistent across `state.ts`, `prompt.ts`, `turn.ts`, `end.ts`. ✅
- `ScenarioTurnJson` (`npcReply`, `stateDelta`, `isFinalTurn`, `suggestedChoicesNext`) consistent between `schemas.ts`, `turn.ts`, `accept.ts`. ✅
- `ScenarioError(code, message)` defined in `accept.ts`, imported by `lifecycle.ts` and all JSON routes. ✅
- `resolveRole` returns `{ roleName, defaultStress }`, used by `accept.ts` + `turn.ts`. ✅
- `mapSessionDetail(session, messages)` / `mapSessionListItem(session)` signatures consistent between `sessionView.ts`, `accept.ts`, and the read routes. ✅
- **Cross-task ordering:** `accept.ts` (Task 9) imports `mapSessionDetail` (`sessionView.ts`, built in Task 14) and `runScenarioEnd` is imported by `turn.ts` (Task 10, stubbed) before `end.ts` is real (Task 13). Both are called out with explicit "Ordering heads-up" notes so the executor creates the stub/file early. ✅

**4. Isolation invariant:** every session load is `findFirst({ where: { id, userId } })`; `acceptScenario`, `runScenarioTurn`, all lifecycle ops, and the detail route reject foreign ids (404/NOT_FOUND). Tested in Tasks 9, 10, 14, 15. ✅

**5. Regression safety:** the only modified existing file is `streamChat.ts` (one guarded, deterministic, no-LLM offer call after the reply). W2/W3 stream tests stay green because their relationships are `acquaintance` and their text has no scenario keyword. Re-run in Tasks 7 and 16. ✅

