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
- Ordinary Chat no longer expands Scenario turns as regular messages. Each completed session is
  represented by one NPC Scenario card in chronological order; the user chooses `Review roleplay`
  to open its persisted Summary and transcript.
- Review is a distinct mode with `Back to chat` in the top bar and `Continue chatting` at the end.
  Returning refreshes the thread so a newly completed Scenario immediately appears as a card.

## P0 demo hardening

- Completed Scenario sessions are restored from SQLite through their Chat and Journey review
  entries, including transcript, grade, language feedback, pragmatics feedback, and relationship
  feedback, without taking over casual Chat after reload.
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
- Browser verification confirms the completed Scenario handoff: ordinary Chat shows exactly one
  review card and none of the three Scenario turn messages; `Review roleplay` restores the persisted
  Summary/transcript; both return actions restore and focus the casual composer with no console errors.
- TypeScript: API and Web typechecks pass.
- API: 89 test files, 246 tests pass.
- Web: 2 test files, 8 tests pass.
- Vite production build passes.
- Playwright pause/resume flow passes: paused banner -> resume with transcript/choices -> pause -> reload -> resume.
- Playwright P0 flow passes: completed result -> reload -> Journey result -> cancel End -> confirm End.
- Demo preflight passes with the Vite/API services, Prisma, Ollama, `qwen3.5:9b`, and
  `nomic-embed-text` ready.
- `git diff --check` passes.

## Recall concurrency P0 fixes

- Recall cascades now stamp each hidden message and open Scenario session with the id of the user
  message that owns the rollback. Restoring one version only reveals rows carrying that ownership,
  so a nested recall remains intact until its own user message is restored.
- Prisma migration `20260722160000_retract_ownership` adds and backfills the ownership columns.
  The follow-up fallback migration also recovers legacy rows whose timestamps diverged after a
  repeated retract request.
- Chat streams now use an `AbortController`. Recalling, restoring, or replacing a stream immediately
  invalidates its sequence and cancels the pending HTTP/Ollama
  request, so stale tokens, completion bubbles, and correction frames cannot re-enter React state.
- NPC reply persistence now checks that the parent user message has neither `retractedAt` nor
  `hiddenAt` and creates the reply in the same transaction. If a direct or cascading recall wins
  first, no NPC reply is persisted; if the reply transaction wins first, the following recall
  cascade hides it normally.
- Regression coverage includes nested `C -> A -> restore A -> restore C` ownership, direct recall
  during generation, cascading recall during generation, and browser-client abort propagation.
- Verification ran on Node `v24.18.0`: all 89 API test files / 249 tests and all 9 Web tests pass;
  API and Web typechecks pass; the Vite production build passes; Prisma reports all 10 migrations
  applied and the SQLite schema up to date.

## Scenario and timeline P1 fixes

- Declining a Scenario invitation now reuses the progression already recorded when the invitation
  was created. The deferred casual reply no longer increments relationship points, conversation
  count, activity history, or daily progress a second time for the same user turn.
- A failed decline request now reconciles the invitation with the server. If that refresh also
  fails, the previous invitation is restored locally so the user can retry accepting or declining
  instead of losing the card.
- SSE `error` is now terminal in both the shared client and Chat state machine. The reader is
  cancelled, the active request generation is invalidated, and any later token, completion, or
  correction frames are ignored.
- Deferred decline lookup is bounded by the invitation timestamp. A legacy invitation with text
  but no stored source-message id can no longer attach its fallback reply to a message sent after
  the invitation.
- Thread history pagination now applies its cursor and `limit + 1` bounds in SQLite for casual
  messages, completed sessions with `endedAt`, and legacy completed sessions without `endedAt`.
  The bounded candidates are merge-sorted into the same stable message-and-Scenario timeline, so
  history requests no longer load the entire conversation before slicing in JavaScript.
- Scenario resume has its own request generation and centralized invalidation. Refresh, abort,
  review, NPC changes, or another lifecycle action now clear `resuming` immediately; stale resume
  responses cannot leave the button spinning or overwrite newer state.
- Regression coverage verifies single progression on decline, invitation-time fallback selection,
  terminal stream errors, and same-timestamp pagination across messages and Scenario cards.
- Verification ran on Node `v24.18.0`: all 89 API test files / 252 tests and all 10 Web tests pass;
  API and Web typechecks pass; the Vite production build and Demo preflight pass; `git diff --check`
  reports no whitespace errors.

## Remaining P2 review fixes

- The returning-user Login form now lives inside the Welcome step instead of after its full-height
  shell. The preview stack was tightened so the username field, password field, and Login button
  all fit in the initial `1264 x 720` viewport without scrolling.
- A recall no longer clears the stored grammar-correction JSON. The retracted marker suppresses the
  correction while hidden, and Undo recall restores the original learning card from SQLite.
- The existing `retractedAt: null` DELETE guard is now covered by a repeated-request regression test,
  confirming that a duplicate recall cannot replace the original ownership timestamp.
- Recall now hides completed and aborted Scenario sessions as well as open sessions. A completed
  review card and its transcript therefore disappear and restore as one rollback unit instead of
  leaving a visible card that opens an empty transcript.
- The Scenario detail endpoint now applies the same `hiddenAt: null` invariant as the list and Chat
  timeline endpoints, so a cached or bookmarked id cannot reopen a hidden session.
- Scenario refresh now clears live messages, choices, HUD, typing, and choice-disabled state before
  applying the refreshed invitation or resumable session. Stale roleplay UI cannot leak across a
  recall, restore, or lifecycle refresh.
- Base seed upserts now refresh every managed NPC, Scenario template, and static Achievement field.
  Re-running `prisma db seed` produces the same canonical configuration as a fresh database,
  including persona prompts, intro messages, keywords, system prompts, rule configs, and enabled
  flags.
- The reported `qwen3.5:9b` model-name issue was not reproduced and required no code change. The
  model is consistently configured in the API, `.env.example`, README, and Demo check; the local
  Ollama tag exists, is loaded, and passes `npm run demo:check`. The README already documents
  `OLLAMA_CHAT_MODEL` as the override for installations using a different tag.
- Verification ran on Node `v24.18.0`: all 90 API test files / 254 tests and all 10 Web tests pass;
  API and Web typechecks pass; `prisma db seed`, the Vite production build, and Demo preflight pass.
  Browser QA at `1264 x 720` confirms the complete Login form is visible at `scrollY = 0`, accepts
  input, and produces no console warnings or errors.

## Follow-up review fixes

- A successful Scenario decline reply now retains its persisted NPC message id. On the next casual
  send it is deduplicated into the ordinary Chat timeline before the temporary decline state is
  cleared, so it remains in chronological order instead of floating below newer turns. Transient
  decline errors are intentionally not promoted as persisted NPC messages.
- Casual sending now uses one shared disabled-state rule in both the Composer and the `send()` guard.
  An in-flight recall therefore disables mouse, keyboard, and programmatic sends until the DELETE
  request settles, closing the race between a new user message and the rollback cascade.
- Equal-timestamp ordering is now documented beside the merge sort: casual messages precede
  Scenario cards, followed by id ordering within each kind. Cursor predicates use the same rule, so
  this deterministic tiebreak remains stable across pagination boundaries.
- Regression coverage raises the Web suite to 14 tests, including decline-reply promotion and recall
  Composer disabling.
