# Review Fix Log - 2026-07-15

## Scope

This pass consolidated the whole-repo review fixes and the follow-up UAT changes for scenario
offers, scenario decline behavior, and reversible chat-message recall.

## Scenario trigger and offer flow

- Lily's Mock Interview template is available from the `acquaintance` relationship stage so the
  course demo does not require an artificially advanced relationship.
- The trigger is deterministic and runs before ordinary NPC generation. It requires an enabled
  template, a sufficient relationship stage, at least three visible user turns, and a matching
  topic keyword in the recent user-message window.
- A trigger creates an invited `ScenarioSession`, stores the triggering turn in
  `triggerRationale`, creates the invitation message, and emits `scenario_offer`. No ordinary NPC
  reply is generated before the invitation.
- Open sessions with `hiddenAt = null` block duplicate offers. Hidden sessions do not block a new
  offer after a message rollback.
- Declining an invitation marks the session declined and streams the original triggering turn as
  ordinary chat without saving the user message twice. A later direct topic mention can trigger a
  fresh offer; unrelated chat does not re-trigger from an old keyword alone.
- Trigger keyword matchers are cached, and English keywords use word boundaries to avoid partial
  matches such as `jobless` matching `job`.

## Scenario UI and concurrency fixes

- The invitation accept action shows loading feedback and disables duplicate clicks.
- Scenario choices collapse immediately after selection while the NPC turn is in progress.
- Late stream events are guarded by the active NPC and stream sequence, preventing an invitation
  from a previous conversation from appearing in the current panel.
- Session loading is scoped by `npcId`; it does not fetch every user's session and filter locally.
- Choice hover styling uses CSS, and summary cards share one grid layout for real and fallback
  notes.
- The legacy bottom-right WebDock demo control was removed from the main product UI; navigation
  now uses the actual app routes and in-app controls.

## Reversible message recall

Message recall is implemented as a soft rollback, not destructive deletion:

- `Message.retractedAt` marks the selected ordinary user message.
- `Message.hiddenAt` hides all messages after the recall point while retaining them in SQLite.
- `ScenarioSession.hiddenAt` hides later open scenario sessions so a rolled-back invitation cannot
  leak into the visible UI or block a new trigger.
- `DELETE /api/threads/:npcId/messages/:msgId` performs the rollback and updates `Thread.lastMsgAt`.
- `POST /api/threads/:npcId/messages/:msgId/restore` clears the rollback, restores later messages
  and scenario sessions, and recomputes `Thread.lastMsgAt`.
- Normal history, NPC previews, scenario session lists, prompt context, and trigger counts filter
  hidden records.
- The UI displays `Message retracted`, provides `Edit` to put the original text back into the
  composer, and provides `Undo recall` to restore the entire hidden future.

## Database migrations

The following migrations are tracked and applied by `npm run db:migrate`:

- `20260715133000_mock_interview_acquaintance`
- `20260715143000_message_retract`
- `20260715145000_message_retract_truncate`
- `20260715152000_reversible_recall`

The last migration adds `ScenarioSession.hiddenAt`. Existing local SQLite records remain usable;
the rollback state is nullable and therefore backward-compatible with earlier sessions.

## Verification

Commands run from the repository root:

- `npm run test -w apps/api -- --run tests/integration/scenario-trigger.test.ts tests/integration/stream-chat-scenario.test.ts`
  - passed, 10 tests.
- `npm run test -w apps/api`
  - passed, 89 files / 243 tests.
- `npm run test -w apps/web`
  - passed, 6 tests.
- `npm run typecheck`
  - passed for API and Web.
- `npm run build:web`
  - passed.
- `git diff --check`
  - passed.

The API and Vite development services remain local-only and are not intended for production
deployment.
