# Scenario Consistency and History Review Fixes - 2026-09-06

## Scope

Address the five findings from the current code review. No database migration,
dependency upgrade, report rewrite, or demo-data reset is included.

## Changes

- Scenario turns generate outside the database transaction, then compare the saved
  session status and state before committing. The user message, NPC message, turn,
  and updated state are saved together. Concurrent or invalidated requests leave no
  partial transcript. `user_message_saved` now follows the successful commit;
  `typing_start` still provides immediate feedback while the UI shows the user's
  optimistic message.
- Accept uses a guarded transaction for the opening, turn zero, active state, and
  activity event. A late generation cannot overwrite an abort, decline, or recall.
  Pause, resume, abort, and decline also check their expected current status.
- Hidden sessions are excluded from lifecycle writes, turn generation, completion,
  and generated Memory-card persistence. Visibility is checked again after model
  generation, not only at request entry.
- The SSE client treats read failures and EOF without a terminal frame as errors,
  cancels the reader, and ignores frames after `error` or `done`. Intentional aborts
  do not show a connection error. Scenario recovery reloads persisted state and
  removes unsaved optimistic transcript entries; an unavailable recovery endpoint
  leaves the controls usable with an explicit connection message.
- Chat exposes cursor-based loading of earlier messages. Overlapping entries are
  deduplicated without replacing current edits, the scroll anchor is preserved,
  and late responses are invalidated by NPC switches, recalls, and history reloads.
- Retained and reviewed the existing `demo-check.mjs` change: its Web check accepts
  either the development entrypoint or the single-port API/SPA entrypoint and
  requires an HTML response. An explicit `DEMO_WEB_URL` remains authoritative.

## Verification

On Node `24.19.0`, `npm run verify` passed:

- All 13 migrations, base seed, and fixed-anchor demo seed on a new temporary SQLite database.
- API and Web typechecks.
- 367 API tests across 102 files, including 11 new concurrency/lifecycle regressions
  and a hidden-during-Memory-generation regression.
- 40 Web tests across 7 files, covering stream interruption, terminal events,
  intentional aborts, encoded timeline cursors, and overlapping history pages.
- Production Web build.

Playwright with Chrome exercised the actual React UI against controlled API
responses at 1440 x 900. It verified history paging and deduplication, preserved
the reading anchor within 2 pixels, rejected an old NPC's delayed page, reconciled
a prematurely closed Scenario stream, and kept the composer and Pause action
usable when recovery failed. No uncaught page errors occurred. The Browser plugin
was unavailable, so this check used the installed Playwright runtime.

## Remaining Boundaries

- The existing three-column layout is not usable at a 390-pixel phone viewport:
  the side panels squeeze out the chat area. This was observed during screenshot
  inspection and is not introduced or fixed by this review.
- The failure tests use deterministic model/API doubles. Live Ollama generation
  quality, latency, and retrieval evaluations were not rerun.
- Local recordings and databases are excluded from the commit. The publication
  target is the private `ruii-wu/popcorn_language` repository, not the public
  `origin` repository named `popcorn-language`.
