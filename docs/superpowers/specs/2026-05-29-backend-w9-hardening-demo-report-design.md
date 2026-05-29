# W9 — Buffer: Hardening, Demo Prep, Report Figures (Design)

> Brainstormed design for the final backend phase. W9 is the **buffer week** in the master
> roadmap (`§十一` / `§十二` of the v2 spec): *加固、demo 准备、报告配图* — hardening, demo
> preparation, report figures. Unlike W1–W8 it had **no fixed plan and no "done-when"**, so
> scope was decided here. The user selected all four candidate workstreams.

- **Spec (source of truth):** `docs/superpowers/specs/2026-05-25-backend-roadmap-design.md` (v2)
- **Master plan:** `docs/superpowers/plans/2026-05-25-backend-overall-plan.md` (W9 row)
- **Predecessors:** W1–W8 shipped — 34 API routes, 19 Prisma models, 216 tests, typecheck clean.
- **Branch:** `backend/w9-hardening-demo-report`

---

## 1. Goal

Turn a feature-complete-but-undocumented backend into something a grader can **clone, run, and
demo in one sitting**, and a report author can **cite figures from** — without changing any
runtime behaviour that W1–W8 already locked in. Three outcomes:

1. **Trustworthy docs** — the README and design docs describe what was actually built, not the W1 snapshot.
2. **A live-looking demo** — one command produces a rich, pre-populated user so the static UI and the API both show a "real" learner journey.
3. **Report-ready artifacts** — the memory-strategy ablation table and architecture/data-flow diagrams exist as committed files.

Plus a light **hardening audit** to confirm the invariants W1–W8 relied on actually hold across all 34 routes.

## 2. Non-goals / scope guards

These are **out of scope by deliberate project decision** and must not be touched or flagged:

- **Auth.** Plaintext password, single-query login, `pop_uid=userId` cookie, no bcrypt / Auth.js / CSRF. Local-demo-only by design; *not* a contribution; *not* a security finding. W9 only *documents* this more prominently — it does not change it.
- **Error envelope.** Already uniform (`{ error: { code, message } }` via `errorJson`); W9 does **not** churn response shapes.
- **No new product features.** Suggestion chips, reverse-decay, Cross-NPC memory (M8), reflective companion, code-switching all remain deferred. W9 adds no endpoints except possibly an internal demo-seed entrypoint (a script, not a route).
- **No live-model dependency in CI.** Nothing W9 adds may require Ollama to be running for tests or for the canonical committed figures.

## 3. Testable vs. artifact deliverables (honesty note)

W9 mixes two kinds of work, and the plan labels each task accordingly:

| Kind | Deliverables | Verified by |
|---|---|---|
| **Code** (TDD'd) | demo-seed script, hardening fixes, ablation-table regenerator | failing test first → implementation → `npm run test` + `typecheck` green |
| **Artifact** (no hollow tests) | README, `docs/backend.md` banner, ablation `.md`, Mermaid diagrams | review + `npm run db:seed` / `db:seed:demo` / `build` / `typecheck` succeed; manual read-through |

We will **not** invent unit tests for prose. Artifact tasks are gated by review and by the commands above, not by `expect(...)`.

---

## 4. Workstreams

### A. Docs accuracy *(artifact)*

**A1 — Rewrite `README.md`.** Current README still says *"Project status: W1 (foundation) complete,"* documents only `/api/system/health`, claims a "17-model schema," and links only the W1 plan. Replace with:
- Status: all 8 phases (W1–W8) done.
- Corrected facts: **19 Prisma models**; the actual run port (see C2).
- A grouped **endpoint catalog** of all 34 routes (auth · profile/onboarding · npcs · threads/messages · scenarios · memories · journey · achievements · settings/system · dev), each with method + one-line purpose, plus a pointer to the SSE event list.
- The **SSE event list** (from the spec §六): `user_message_saved · typing_start/end · token · message_complete · correction · suggestions_update · scenario_offer · state_update · choices · scenario_end · error · done`.
- Links to every W-plan and to this design + the v2 spec.
- A **promoted auth-scope callout** (local-demo-only, never deploy) near the top, not just at the bottom.
- A short "Demo" section pointing at `npm run db:seed:demo` (workstream C) with the `demo`/`demo` login.

**A2 — Banner `docs/backend.md`.** It is the *v1* design doc and has drifted (lists never-built routes: `/api/session/init`, `/suggestions`, `/typing`; says "no complex auth"; 7 modules only). Rather than rewrite a history artifact, prepend a banner marking it **superseded** and pointing to the v2 spec + the README catalog as the source of truth. The body is preserved for provenance.

### B. Report figures + ablation *(artifact, + one small code regenerator)*

**B1 — Ablation table `docs/reports/memory-ablation.md`.** The canonical, always-reproducible figure uses the **deterministic eval fixture** (no Ollama): run the harness against `DATASETS` default and render `perStrategy` through the existing `toMarkdownTable`. The fixture demonstrates the hypothesis: recency ≈ 0.125 < summary ≈ 0.625 < semantic = hybrid = 1.0. The `.md` includes:
- The rendered table (recall@k · latency · token cost).
- A prose paragraph interpreting the ablation (why semantic/hybrid win on this corpus).
- A boxed **"reproduce live"** command documenting `POST /api/dev/memory-eval` for an Ollama-backed run whose numbers go in the report appendix.

**B2 — Regenerator (code, TDD'd, small).** A `npm run report:ablation` script (`scripts/gen-ablation.ts` or similar) that regenerates the table section deterministically from the fixture, so the committed `.md` can't silently drift from `metrics.ts`/`dataset.ts`. Tested by asserting its output contains the expected strategy rows and the known ordering.

**B3 — Mermaid diagrams `docs/reports/architecture.md`.** (1) A module/architecture diagram — the 7 P0 modules + 2 P1 modules over the Next.js / Prisma-SQLite / Ollama substrate, with the `withUser → service → prisma(scoped by userId)` request path. (2) The chat (Workflow A) and scenario (Workflow B) flows as Mermaid sequence diagrams, lifted from the spec's ASCII. These are for direct paste into the report.

### C. Demo seed script *(code, TDD'd)*

**C1 — `prisma/seed-demo.ts` + `npm run db:seed:demo`.** *Additive* — it never touches the canonical `seed.ts` (which stays the minimal 3-NPC/2-scenario/6-achievement baseline). It is **idempotent**: it wipes and recreates only the demo user's data, leaving NPC/template/achievement defs (owned by the base seed) intact. It assumes the base seed has run (NPCs/templates/defs exist). It creates a login **`demo` / `demo`** with:
- `UserProfile` + `UserSettings` (e.g., `memoryStrategy: 'hybrid'`, grammar on).
- Relationships at varied stages — **Lily = close (3)**, **Chen = friend (2)**, **Emma = acquaintance (1)** — each with a `RelationshipEvent` history where the stage implies it.
- A thread per NPC with a few seeded user/NPC messages.
- Several `MemoryFact`s (pet, job, hobby…) with embeddings omitted/empty (no Ollama) and one curated `Memory` card.
- **One completed `ScenarioSession`** (mock_interview with Lily) + its `ScenarioSummary` with a real grade and the three notes, plus the `ScenarioTurn`s.
- A few **unlocked achievements** (`UserAchievement`) consistent with the above (first_chat, scenario_survivor, …).
- `ActivityEvent`s dated across the **last several days** so `journey/streak` and `journey/summary` render a non-trivial streak.

The script must produce state that the **real** journey/achievements/memory endpoints read back as non-empty for the demo user.

**C2 — Pin the dev port.** `package.json` `"dev": "next dev"` → `"next dev -p 3100"` (port 3000 is OS-blocked on the dev machine per project memory), and update the README run command + health-check URL accordingly. This resolves a long-standing standing item.

### D. Hardening audit *(code, additive fixes only)*

**D1 — Invariant audit across all 34 routes.** Confirm, and fix any stragglers (additively):
- Every *business* route goes through `withUser` (the 401 gate). The only legitimate exceptions are `auth/register`, `auth/login` (pre-auth) and the dev-gate ordering in `dev/memory-eval` (gate-before-`withUser`, by design).
- Every body-parsing route validates input with a Zod schema and returns `400 BAD_REQUEST` on failure (close any route that does `await req.json()` without a guard).
- Multi-user isolation: every query/delete is `userId`-scoped (spot-confirm the routes touched since W5).

Findings that are already correct are recorded as "audited, OK" in the plan; only genuine gaps get a fix + a regression test.

**D2 — Whole-system smoke.** A `tests/integration/smoke.test.ts` (or `scripts/smoke.ps1` against a live dev server — decided in the plan) that walks the **happy path end-to-end** on a freshly-seeded DB with a **mocked** Ollama: register → onboarding → send a chat message (SSE) → read memories → list journey/achievements → run the eval route. This is W9's concrete **"done-when"** evidence: a single green run proves the assembled system holds together, not just the unit slices.

---

## 5. Definition of done

- README + `docs/backend.md` accurately describe the shipped system; all 34 routes catalogued; auth disclaimer promoted.
- `docs/reports/memory-ablation.md` (table + interpretation + live-run command) and `docs/reports/architecture.md` (architecture + 2 sequence diagrams) committed.
- `npm run db:seed` then `npm run db:seed:demo` yields a `demo`/`demo` user whose journey/achievements/memory endpoints return rich, non-empty data; dev runs on **:3100**.
- Hardening audit complete (gaps fixed + regression-tested, or recorded as OK); whole-system smoke green.
- **All existing + new tests pass; `typecheck` clean.** No auth/error-envelope/feature changes.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Demo seed drifts from schema changes | It's `prisma`-typed; a test asserts the rich state, so a schema break fails the test. |
| Ablation `.md` drifts from `metrics.ts` | B2 regenerator + its test keep the committed numbers tied to code. |
| "Hardening" tempts scope creep into auth/error refactors | §2 scope guards; audit records OK items rather than "fixing" non-problems. |
| Artifact tasks have no tests → silent rot | Gated by `db:seed:demo` / `build` / `typecheck` + review, and the testable regenerator covers the one figure that *can* drift. |

---

> Version: v1 · 2026-05-29 · brainstormed from the v2 spec §十一/§十二 and the W1–W8 implemented state.
> Next: `superpowers:writing-plans` → `docs/superpowers/plans/2026-05-29-backend-w9-hardening-demo-report.md`.
