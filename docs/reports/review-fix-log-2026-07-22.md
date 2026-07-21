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

## Verification

- Node: `v24.18.0` selected through the repository `.nvmrc`.
- TypeScript: API and Web typechecks pass.
- API: 89 test files, 245 tests pass.
- Web: 2 test files, 8 tests pass.
- Vite production build passes.
- Playwright pause/resume flow passes: paused banner -> resume with transcript/choices -> pause -> reload -> resume.
- Playwright P0 flow passes: completed result -> reload -> Journey result -> cancel End -> confirm End.
- Demo preflight passes with the Vite/API services, Prisma, Ollama, `qwen3.5:9b`, and
  `nomic-embed-text` ready.
- `git diff --check` passes.
