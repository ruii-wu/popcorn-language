# Popcorn Language Backend — Overall Implementation Plan (Master)

> **For agentic workers:** This is the **master index**, not a task list. It decomposes the backend into per-phase sub-plans, each living in its own `docs/superpowers/plans/` file with bite-sized TDD tasks. Execute one sub-plan at a time via `superpowers:subagent-driven-development` or `superpowers:executing-plans`.

**Goal:** Turn the static web prototype into a working local-first backend (multi-user, Ollama-driven persistent NPC chat + embedded scenario gameplay + pluggable memory) per `docs/superpowers/specs/2026-05-25-backend-roadmap-design.md`.

**Architecture:** Single-process Next.js 14 (App Router, TS) serving REST + SSE; service layer in `src/server/services/`; Prisma + SQLite scoped by authenticated `userId`; Ollama (qwen2.5:7b-instruct + nomic-embed-text) for chat/JSON/embeddings; async work fire-and-forget in-process.

**Tech Stack:** Next.js 14, TypeScript, Prisma, SQLite, Zod, Vitest, Ollama HTTP API, Server-Sent Events.

**Spec:** `docs/superpowers/specs/2026-05-25-backend-roadmap-design.md` (v2).

---

## 1. Salvage note (read before W1)

The reverted commit **`564965a` ("bckend v1")** already contains a working slice of W1: Next.js skeleton, a 14-model Prisma schema, seed data (3 NPC / 1 scenario / 6 achievements), an Ollama client, a PromptBuilder, and ~75 Vitest cases. It was reverted; the only blocker recorded was "Node.js not installed."

**This does not change because the design moved to v2** (multi-user auth, `memoryStrategy`, embeddings, `MemoryRetrievalLog`). Two viable approaches for W1 — **decided per the W1 plan**:
- **Recover-and-adapt**: `git show 564965a:<path>` to restore each artifact, then adapt to the v2 spec with tests.
- **Fresh TDD**: build W1 from scratch following the writing-plans methodology.

Either way, W1's *target state* is defined by the v2 spec, not by what `564965a` happened to contain.

---

## 2. Global conventions (apply to every sub-plan)

**Directory layout**
```
src/
  app/api/.../route.ts        # Next.js route handlers (REST + SSE)
  server/
    auth/                     # Module 0: session, requireUser
    llm/                      # Module 1: ollama client (chat/chatJson/embed/health)
    prompt/                   # Module 2: PromptBuilder
    memory/                   # Module 3: MemoryStrategy interface + impls + eval
    scenario/                 # Module 4: orchestrator, triggerJudge, state machine
    relationship/             # Module 5
    correction/               # Module 6
    achievements/             # Module 7
    async/                    # fire-and-forget dispatcher
    db/                       # prisma client singleton
prisma/
  schema.prisma
  seed.ts
tests/
  unit/                       # pure JS, no Ollama/SQLite needed
  integration/                # hits SQLite (and mocked Ollama)
```

**Test strategy**
- **Unit tests** (`tests/unit/`) must run with **no Ollama and no DB** — mock the Ollama client and pass plain objects. These are the bulk and must always pass in CI/local.
- **Integration tests** (`tests/integration/`) use a throwaway SQLite file and a **mocked** Ollama client; never call a live model in tests.
- TDD: write the failing test first, watch it fail, implement minimal code, watch it pass, commit.

**Commit cadence:** one commit per completed task (test + implementation together). Commit messages: `feat:` / `test:` / `chore:` prefix.

**Run commands** (after Node + Ollama installed):
```
npm install
npx prisma migrate dev --name <name>
npm run db:seed
npm run test
npm run dev          # http://localhost:3000
```

**Definition of "phase done":** all that phase's tests green + the named UI surface demonstrably works against the dev server (or, for non-UI phases like W7, the named artifact is produced).

---

## 3. Phase decomposition (one detailed plan file each)

| Phase | Plan file (to be written) | Goal / Delivers | Depends on | Spec § | Done when |
|---|---|---|---|---|---|
| **W1** | `2026-05-25-backend-w1-foundation.md` | Project skeleton, Prisma schema + migrate, seed (3 NPC/1 scenario/6 achievements), **minimal auth foundation** (User + session + `requireUser`), **Module 1 Ollama client** (stream/chatJson+retry/embed/health), **Module 2 PromptBuilder** | — | §四,七(M1,M2),八 | `GET /api/system/health` green; unit tests pass |
| **W2** ✅ | `2026-05-25-backend-w2-chat-sse.md` | register/login routes + onboarding writeback + Threads/Messages CRUD + **SSE streaming chat** | W1 | §四,五(1–4),六 | **DONE** — register→login→logout→me, profile GET/PUT, onboarding/complete, NPC list+detail, thread history+clear, `POST /threads/:npcId/messages` SSE streaming chat. Live HTTP smoke green (graceful `error` event when Ollama is down); 40 W2 tests pass. |
| **W3** | `…-w3-memory-engine.md` | **MemoryStrategy interface** + recency/summary/semantic impls; factExtract; recall wired into PromptBuilder; right-panel endpoints | W2 | §七(M3),九 | NPC recalls facts across turns; `memoryStrategy` switch works |
| **W4** | `…-w4-scenario.md` | **Scenario Orchestrator** — Mock Interview end-to-end (triggerJudge → accept → active JSON loop → HUD state → choices → summary → memory + relationship payoff) | W3 | §五(5),七(M4),十(B) | A→B→C→D runs |
| **W5** | `…-w5-correction-progression-achievements.md` | Module 6 Grammar Correction + Module 5 Relationship/Progression + Module 7 Achievement engine | W4 | §七(M5,M6,M7) | corrections, stage-ups, unlocks fire |
| **W6** | `…-w6-journey-settings-system.md` | Journey aggregates + Settings (incl. `memoryStrategy`) + system health/models/reset + onboarding finalize | W5 | §五(7,8,9),十(C) | Journey dashboard fully live |
| **W7** | `…-w7-memory-eval.md` | **Memory-strategy eval harness** + ablation run (`/api/dev/memory-eval`, `MemoryRetrievalLog`) | W3 (interface), W6 | §五(10),九 | comparison table/figures produced |
| **W8** | `…-w8-second-scenario-and-p1.md` | 2nd scenario template + one P1 angle (Cross-NPC memory OR dynamic achievements) | W4 (W7 ideally) | §三(P1),七(M8,M9) | stretch demo content |
| **W9** | (buffer — no fixed plan) | Hardening, demo prep, report figures | all | §十一 | — |

### Dependency graph
```
W1 ─► W2 ─► W3 ─► W4 ─► W5 ─► W6 ─► W7
                          └──────────┘   (W7 needs W3 interface + W6 settings)
                    W8 needs W4 (and W7 ideally)
```

### Protect order under deadline pressure
If reports compress the schedule, **protect W7 (eval harness — highest research value) over W8 (2nd scenario — demo polish)**, per spec §九/§十二.

---

## 4. Cross-phase interface contracts (lock these early)

These are referenced by multiple sub-plans; defining them in W1–W3 prevents churn:

- **`requireUser(req) → { userId } | 401`** (W1) — every business handler's first line.
- **`OllamaClient`** (W1): `chat(messages, opts) → AsyncIterable<string>`, `chatJson<T>(messages, schema: ZodSchema<T>, opts) → Promise<T>`, `embed(text) → Promise<number[]>`, `health() → Promise<HealthInfo>`.
- **`PromptBuilder.build(ctx) → string`** (W1) — `ctx` carries npc, profile, relationship, recalled memory, summary, recent buffer, mode.
- **`MemoryStrategy.recall(q: RecallQuery) → Promise<RecalledItem[]>`** (W3) — consumed by PromptBuilder.
- **SSE event names** (W2): `user_message_saved · typing_start/end · token · message_complete · correction · suggestions_update · scenario_offer · state_update · choices · scenario_end · error · done`.

---

## 5. How to use this master plan

1. Pick the next phase whose dependencies are met.
2. Open (or write) its detailed plan file; execute task-by-task via the chosen execution skill.
3. On phase completion, check the "Done when" box here and commit.

> Version: v1 · 2026-05-25 · derived from spec v2. Update §3 if phases are re-sequenced or split.
