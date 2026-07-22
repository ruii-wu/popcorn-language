# Review Fix Log - 2026-07-22

## Scenario persistence and resume flow

- The active Scenario header now exposes separate `Pause` and `End` actions. `Pause` persists
  `status = paused`; `End` remains the explicit terminal `aborted` transition.
- The web client now calls the existing pause/resume endpoints instead of treating every exit as
  an abort.
- Returning to an NPC detects both paused sessions and active sessions left by navigation or a
  browser reload, then displays a Resume banner in casual chat.
- Resume reloads the persisted transcript, HUD state, remaining turns, and the latest response
  choices. The choices were already stored in `ScenarioTurn.nextChoices`; the session detail API
  now validates and returns them.
- Pause and End are disabled while a Scenario turn is being generated to avoid a lifecycle race
  with the active streaming request.

## Settings and demo reset

- The Chat rail Settings icon now navigates to the Settings page.
- Settings includes a working Logout action that clears the session cookie and returns to sign-in.
- Settings includes a confirmed Reset History action. It clears user content and progress while
  preserving identity, profile, and preferences, then restores the initial Lily Friend state for
  a clean demo run.

## Initial relationship baseline

- Completing onboarding initializes Lily at the Friend stage and remains idempotent for returning
  users.
- Emma now follows the same Friend baseline for onboarding, Settings history resets, and the demo
  seed. Existing SQLite users are upgraded or provisioned by migration while preserving any
  stronger relationship stage, so Emma's Friend-gated Flat Viewing can be demonstrated directly.

## Conversation list priority

- Lily is now the fixed first item returned by the NPC list API. This keeps the onboarding
  companion at the top of the conversation rail and makes Lily the initial active chat; the
  remaining NPCs retain their stable id order.

## Scenario completion handoff

- Completed Scenario summaries now expose a `Continue chatting` action. It exits the temporary
  Scenario summary view, restores the NPC's normal chat context and focuses the composer, while
  keeping the completed transcript and grade available in Journey.

## P0 demo hardening

- Completed Scenario sessions are restored from SQLite after a reload, including transcript,
  grade, language feedback, pragmatics feedback, and relationship feedback.
- Journey now lists completed roleplays and lets the user reopen the persisted result and
  transcript instead of losing the result when leaving the chat screen.
- End now requires confirmation. After confirmation, the UI shows `Ending...` and waits for the
  abort API to succeed before removing the Scenario; a failed request keeps the saved state intact.
- `npm run demo:check` verifies Node 24, the Vite and API services, Prisma migration status,
  Ollama availability, the chat and embedding models, and whether the chat model is warm.
- Repository-local `.DS_Store` files were removed and ignored. The machine-specific
  `.claude/settings.local.json` remains available locally but is no longer tracked.
- Message rollback now uses `(createdAt, id)` as a stable order. This prevents a later NPC reply
  created in the same millisecond as the recalled user message from surviving the rollback.

## Journey and Settings scrolling

- Journey and Settings now use an explicit scrollable main-pane modifier. The shared
  `.pane-main` rule is loaded after Tailwind utilities and previously overrode
  `overflow-y-auto` with `overflow: hidden`, making content below the viewport unreachable.
- Browser verification confirms both panes compute to `overflow-y: auto`; Journey reaches its
  footer and Settings reaches its account controls without console errors.

## Typing and streaming state

- Casual-chat SSE now closes `typing_start` immediately before the first non-empty `token`, so the
  pending typing indicator and the progressively rendered NPC response are mutually exclusive.
- The web client also clears typing on every token as a defensive guard against stale servers or
  an unexpected event order. Empty generations and model failures still emit `typing_end`.
- The stream integration test asserts `typing_start -> typing_end -> token`, and a live browser
  check confirmed the partial response was visible while the typing indicator count was zero.

## Verification

- Node: `v24.18.0` selected through the repository `.nvmrc`.
- Prisma migration `20260722143000_emma_initial_friend` applies cleanly and upgrades the local
  demo user's Emma relationship to `friend` / stage value `2` / `30` points.
- Onboarding, demo-seed, and Flat Viewing integration coverage pass with Emma at the Friend
  baseline.
- Browser verification confirms the completed Scenario handoff: `Continue chatting` removes the
  Summary view, restores the casual composer, and focuses it for the next message.
- TypeScript: API and Web typechecks pass.
- API: 89 test files, 245 tests pass.
- Web: 2 test files, 8 tests pass.
- Vite production build passes.
- Playwright pause/resume flow passes: paused banner -> resume with transcript/choices -> pause -> reload -> resume.
- Playwright P0 flow passes: completed result -> reload -> Journey result -> cancel End -> confirm End.
- Demo preflight passes with the Vite/API services, Prisma, Ollama, `qwen3.5:9b`, and
  `nomic-embed-text` ready.
- `git diff --check` passes.
