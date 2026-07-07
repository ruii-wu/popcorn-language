# Review Fix Log - 2026-07-07

## Scope

Fixed the review findings from the Popcorn Language whole-repo review:

- Scenario choice turns now send and persist the selected choice text and tone, not only the choice id.
- Memory recall now prevents explicitly NPC-scoped facts from leaking to other NPCs. Legacy/unscoped facts with `knownToNpcs: []` remain globally visible for backward compatibility.
- Chat/scenario/dynamic-achievement LLM clients now honor the caller's `UserSettings.modelName`.
- Streaming POST clients now emit `done` after network or HTTP errors so pending UI can reset.
- Settings is now a real SPA route at `/settings`, linked from the nav rail.
- Setup/docs/model copy were updated from stale Next/qwen2.5 wording to Hono/qwen3.5 wording.
- API Vitest config now defaults `DATABASE_URL` to `file:./dev.db` for clean local test runs.

## Regression Tests Added

- `apps/api/tests/integration/recall.test.ts`
  - verifies facts explicitly known only to another NPC are not recalled for the active NPC.
- `apps/api/tests/integration/chat-model-route.test.ts`
  - verifies chat route constructs `OllamaClient` with the caller's saved `modelName`.
- `apps/web/src/api/client.test.ts`
  - verifies streaming client emits `error` then `done` on network failure.
- `apps/web/src/components/scenario/useScenarioSession.test.ts`
  - verifies choice payload includes selected text and tone.

## Red-Green Notes

Initial targeted runs failed as expected:

- `recall.test.ts`: Chen-only fact appeared in Lily recall.
- `chat-model-route.test.ts`: `OllamaClient` constructor received `{}` instead of `{ chatModel }`.
- `client.test.ts`: network failure emitted only `error`, not `done`.
- `useScenarioSession.test.ts`: `choiceToTurnPayload` did not exist.

After implementation, targeted tests passed.

## Final Verification

Commands run from `<repo>`:

- `npm run test` - passed, 88 API test files / 235 tests.
- `npm run test -w apps/web` - passed, 2 Web test files / 6 tests.
- `npm run typecheck` - passed for API and Web.
- `npm run build:web` - passed.

Notes:

- `npm install` and `npm run db:generate` were run before this fix pass.
- `prisma/dev.db` was initialized locally for testing and remains git-ignored.
