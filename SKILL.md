---
name: phased-tdd-coding
description: Drive multi-phase coding projects through environment-first validation, vertical-slice roadmapping, and per-module TDD with honest status reporting. Use this whenever the user is starting a non-trivial coding project (anything beyond a single file/script), resuming a multi-phase project, planning a roadmap before writing code, or recovering from a project where status reports drifted away from reality. Especially trigger when the user mentions phases/weeks/milestones, capstone projects, or projects involving external runtimes (Node, Python, databases, local model servers, etc.).
---

# Phased TDD Coding Workflow

A workflow for AI-assisted coding on projects that take more than one sitting. Optimized to prevent the most common failure mode: producing large volumes of unrun, unverified code while reporting confident status.

The core loop is:

> **Stage 0 (Pre-flight)** → **Stage 1 (Roadmap)** → **Stage 2 (Per-phase TDD)** → repeat Stage 2

Do not skip Stage 0. Do not start Stage 2 without Stage 1. Do not mark a phase done without Stage 2's exit criteria.

---

## Stage 0 — Pre-flight (Environment + Skeleton)

Before writing a single line of feature code, prove the local dev loop works end-to-end.

**Checklist:**

1. **Runtime verification.** Run each required toolchain command and record the actual version. Examples: `node --version`, `npm --version`, `python --version`, `which ollama`, `psql --version`. Never assume — check.
2. **Hello-world skeleton.** Stand up the absolute minimum that proves the toolchain renders something: a Next.js page that says "hello" at `http://localhost:3000`; a CLI that prints `--help`; a library with one trivial `add(1,2)` function imported by one trivial test.
3. **Test runner alive.** Set up the test framework. Run it once. Confirm you see `0 passing, 0 failing` (or one trivial passing test). Don't write 75 tests yet — just prove the runner runs.
4. **Smoke checklist documented.** Write down (in `progress.md` or equivalent): the exact commands that prove the project is alive (`npm run dev`, `npm test`, `npm run db:migrate`, etc.). These are your re-entry rituals for every future session.

**Stop conditions:** If any toolchain is missing (e.g., Node not installed), STOP. Do not write feature code. Surface the blocker. Ask the user to install it. Do not generate code that you cannot execute — that is how 75-test phantom backlogs are born.

---

## Stage 1 — Roadmap

Produce a roadmap before writing real features. Keep it short (1-2 pages). It is a living document, not a contract.

**Required fields:**

- **End state (P0).** One paragraph: what does "shippable" look like? What's the smallest demo that justifies the project?
- **Phase list (5-10 phases).** Each phase has: (a) scope in 1-3 sentences, (b) explicit exit criteria — a thing that runs, not a list of files, (c) a smoke test the human can perform.
- **Highest-risk assumption.** The single technical bet that, if wrong, kills the project. (Examples: "7B model produces stable JSON", "Ollama latency under 2s on this hardware", "SQLite can model our state".) The first 1-2 phases must include a minimum vertical slice that validates this assumption. Do not save the risk for the end.
- **Out of scope.** Write down what you are explicitly NOT building. This is where scope creep dies.

**Anti-pattern alert:** A roadmap that lists files/modules instead of running behaviors is a fake roadmap. "W3: implement Memory Engine v1" is weak. "W3: NPC correctly recalls user's coffee order after 20 messages of unrelated chat, demonstrated in a real session" is a roadmap.

---

## Stage 2 — Per-Phase TDD Loop

Repeat this loop for every phase. Do not batch phases.

### 2a. Phase Kickoff (≤10 min)

- Re-read the phase scope from `roadmap.md`. If reality has diverged from the roadmap, **update the roadmap first**, then proceed.
- Pick the **smallest end-to-end slice** that exercises this phase. Not "the cleanest module first" — the slice that proves the phase concept works at all. Often this is uglier than the eventual shape, and that's fine.
- Identify 2-4 modules/functions inside the slice. Order them by dependency.
- Write down (in `progress.md`) what's intentionally out of scope for this phase. Park scope creep here, do not enact it.

### 2b. Micro-Loop Per Module (TDD that's actually TDD)

For each module, run a tight red-green cycle. **Do not write all tests for all modules then all code for all modules.** That defeats the entire point.

1. Write **1-3 failing tests** for the next behavior. Run them. Confirm they fail (RED). If they pass before you write the code, the test is wrong.
2. Write the **minimum code** to pass. Run tests. Confirm they pass (GREEN).
3. Refactor if needed. Re-run tests.
4. Move to the next behavior.

**Critical rule:** never go more than ~30 minutes of wall-clock time without running tests. If you've written 200 lines of code and no tests have executed, you're not doing TDD — you're hoping.

**When mocking external services** (Ollama, third-party APIs, etc.), write the mock and the test against the mock first. Then write a *separate* integration test that hits the real service (gated behind an env flag if slow). Don't pretend a unit test against a mock is integration coverage — it isn't.

### 2c. Phase Smoke Test (mandatory exit gate)

A phase is NOT done when all unit tests pass. A phase is done when:

1. ✅ All tests for this phase pass (`npm test` shows green).
2. ✅ You have **manually exercised the deliverable** in a real runtime — clicked the button, curl'd the endpoint, run the CLI command, watched the SSE stream actually stream. Screenshot or paste the output into `progress.md`.
3. ✅ You can describe in one sentence what the user can now do that they couldn't before this phase.

If you can't do (2), the phase is not done, regardless of test results. Unit tests can lie. Real runs can't.

### 2d. Phase Retro (≤15 min, written down)

At phase end, append to `progress.md` (overwriting old transient state) and `decisions.md` (append-only):

- **🟢 What works** — with proof links: test output snippets, screenshots, log excerpts.
- **🟡 What's shaky** — code that passes tests but you don't trust, or paths you didn't exercise.
- **🔴 Blockers / open questions** — things you couldn't resolve alone. Surface these to the user *now*, not later.
- **📝 TODOs carried forward** — explicitly into a future phase, not floating.
- **📐 Decisions made** (to `decisions.md`) — any non-trivial choice with rationale and what was rejected. Decisions are permanent record; never delete them.

---

## Status Hygiene (Critical)

Use these states and only these states. Never inflate.

| State | Meaning |
|---|---|
| 🔴 Not started | No code written. |
| ⚪ Drafted | Code typed, **never executed**. (This is where "I wrote 75 tests in PowerShell" lives.) |
| 🟡 Unit-tested | Tests run green, but never exercised end-to-end. |
| 🟢 Smoke-passed | Tests + manual exercise both green. Phase exit-criteria met. |
| ✅ Battle-tested | Used in a real downstream workflow (next phase consumed it without surprise). |

**Never write "100% complete" until 🟢 minimum.** "Code 100%" is meaningless; the only thing that matters is "behavior 🟢."

**If a runtime is missing** (Node not installed, DB not migrated, model not loaded), the dependent module is ⚪ at best, no matter how much code exists. State this explicitly.

---

## Living Documents

Maintain three files. Keep them lean.

- **`roadmap.md`** — phase list with current status flags. Updated whenever a phase boundary crosses, or when reality forces a replan. The plan is allowed to change; silently diverging from it is not allowed.
- **`decisions.md`** — append-only. Each entry: date, decision, rationale, alternatives rejected. This is your project memory. Never delete entries — strike through if reversed.
- **`progress.md`** — current snapshot only: what's the next action, what's blocked, recent retros. Overwritten regularly. Should always answer "if I open this project tomorrow, what do I do first?"

`context.md` (project background, architecture, constraints) is separate and changes rarely — treat it as reference, not running state.

---

## Anti-Patterns to Refuse

If you catch yourself or the user doing these, stop and reset:

1. **Batch-tests-at-end.** Writing all tests after all code, never executing mid-development. This is the single most common failure mode of AI-assisted coding. Tests are a development tool, not a victory lap.

2. **Code-complete-equals-done.** "I finished writing the module" is not "the module works." Until it has executed against a real runtime, it is a hypothesis.

3. **Environment-last.** Installing the toolchain at the end of a session means everything before it was speculative. Toolchain is Stage 0, not Stage 7.

4. **Optimistic ✅ inflation.** Marking tasks complete based on lines-of-code rather than behavior-verified. This compounds: every false ✅ is a future debugging session.

5. **Silent scope drift.** Pulling W6 forward to W1 without updating the roadmap. Either commit the change to `roadmap.md` and `decisions.md` or don't make it.

6. **Blocker silence.** When blocked (missing dependency, ambiguous spec, broken upstream), STOP and surface to the user. Do not generate more unrunnable code to fill the void. Document the blocker; ask for resolution.

7. **Mock coverage masquerading as integration.** A test that passes against a mocked Ollama tells you nothing about real Ollama behavior. Maintain a separate (possibly slower, env-gated) integration suite.

---

## Quick Reference — One Cycle

```
Stage 0 (once per project):
  └─ Verify toolchain → skeleton runs → test runner runs → document smoke commands

Stage 1 (once per project, revisit at phase boundaries):
  └─ End state + 5-10 phases + risk assumption + out-of-scope

Stage 2 (every phase):
  ├─ 2a Kickoff: pick smallest end-to-end slice, list modules, park out-of-scope
  ├─ 2b Micro-loop: RED → GREEN → refactor, per module, never >30min without running tests
  ├─ 2c Smoke gate: tests green + manual run + one-sentence user-facing change
  └─ 2d Retro: 🟢🟡🔴📝📐 → update progress.md + decisions.md + roadmap.md
```

---

## Notes for the AI executing this skill

- When the user hands you a project mid-flight, **run Stage 0 verification first** even if they say "I already did that." Mismatched assumptions about which version of Node is installed kill more sessions than anything else.
- When asked to "just write the code," push back gently: ask which phase, what the exit criterion is, and what the smoke test will be. If the user truly wants raw code-spew (e.g., a throwaway script), drop the workflow — it's only worth it for multi-phase work.
- When the user reports status, sanity-check it. "All tests passing" without ever having executed `npm test` is a ⚪, not a 🟢. Be willing to say so.
- Prefer running a small thing now over writing a large thing for later.
