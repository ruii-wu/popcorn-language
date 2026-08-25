# Review Fix Log - 2026-08-11

## Scope

This pass reviewed and hardened the Learner Model and adaptive Scenario recommendation implementation, with emphasis on failure recovery, deterministic aggregation, cooldown consistency, and demo readiness.

## Completed Fixes

- Made Scenario completion atomic: session completion, persisted summary, summary message, relationship progression, and `scenario_completed` activity now commit in one Prisma transaction.
- Made Scenario completion retry-safe: failed transactions leave the session active; immutable learning signals remain hidden from normal aggregation until a later retry succeeds.
- Corrected mastery snapshots so `preLevels` excludes the current Scenario and `postLevels` includes it.
- Unified recommendation and `/start` cooldown boundaries and JSON parsing.
- Changed completion cooldown to use visible completed `ScenarioSession` rows instead of activity payloads, so hidden/retracted sessions do not block future recommendations.
- Added deterministic signal replay, focus ordering, and rounded recommendation scoring.
- Rejected zero-weight evidence and required evidence text for Scenario success signals.
- Wired manual correction requests into immutable `LearningSignal` persistence.
- Replaced substring profile matching with token matching.
- Validated seeded Scenario target skills against the fixed taxonomy.
- Preserved meaningful status labels for legacy numeric mastery snapshots.
- Fixed Journey loading/error states, responsive Learning Focus layout, recommendation start hand-off, and Settings CEFR loading state.
- Expanded the demo seed with CEFR, learning evidence, mastery snapshots, and a targeted Flat Viewing recommendation.

## Deployment Boundary

The open-Scenario concurrency guard intentionally relies on SQLite's serialized writer because this repository is a course project. A future Postgres deployment must add a partial unique index on `(userId, npcId)` for open statuses (`invited`, `accepted`, `active`, `paused`).

## Verification

- API: 96 test files, 321 tests passed.
- Web: 5 test files, 21 tests passed.
- TypeScript: API and Web typechecks passed.
- Production Web build passed.
- Prisma: 12 migrations found; local database schema is up to date.
- `git diff --check` passed.

## Follow-up Hardening - 2026-08-12

- Moved Scenario evaluation Signals into the same transaction as the completion claim, mastery snapshots, persisted Summary, relationship progression, and activity event. Failed attempts no longer leave orphan evidence, and a retry cannot combine one LLM evaluation's Summary with another evaluation's Signals.
- Added `POST /api/scenarios/sessions/:id/complete` and a `Retry review` UI state. A durable final turn with `turnsLeft = 0` now blocks additional roleplay messages and retries only the completion tail.
- Made generated Scenario Memory cards idempotent through `Memory.sourceKey`; completed-session retries reuse the persisted Summary and can compensate a failed card without duplicate rows.
- Added one bounded client-side background retry when Scenario completion succeeds without a Memory card. It never delays the Summary or loops indefinitely.
- Decoupled auxiliary learning metadata from the main Correction and Scenario Summary schemas. Malformed Signal rows are dropped independently instead of discarding a valid user-facing result.
- Rejected zero-confidence evidence at input and aggregation boundaries.
- Changed Journey, `/auth/me`, and Achievement derivation to use visible, non-retracted user messages and visible completed Scenarios rather than append-only audit events.
- Added a SQLite database-file preflight before `db:migrate`, and verified all 13 migrations on a brand-new database path.

### Follow-up Verification

- API: 97 test files, 332 tests passed.
- Web: 5 test files, 23 tests passed.
- TypeScript: API and Web typechecks passed.
- Production Web build passed.
- Prisma: all 13 migrations applied to both the existing database and a newly created SQLite path.
- `git diff --check` passed.

Achievement unlock rows remain monotonic by design: recall removes hidden evidence from current totals and future eligibility checks, but it does not revoke a badge that was already issued.

Review alignment notes: the Memory migration backfills every legacy row with a non-null `sourceRef`, so pre-migration Scenario cards use the same `sourceKey` as runtime upserts. The `/complete` route accepts completed sessions only when their Summary already exists; that branch compensates optional post-commit work rather than reconstructing corrupt completed rows.
