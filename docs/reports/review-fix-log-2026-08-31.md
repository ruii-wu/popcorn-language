# Final Submission Stabilisation Log - 2026-08-31

## Scope

This pass freezes the capstone implementation and turns the working development repository into a
reproducible submission candidate. It consolidates the product changes completed since the previous
review, adds a deterministic release gate, and aligns the documented demo flow with the code.

## Product changes consolidated

- Learner Model evidence now produces concrete practice advice, up to three demo Learning Focus
  areas, and an explainable scenario recommendation rather than showing weakness labels alone.
- Scenario choices are normalised for relevance and diversity. Generated duplicates are removed,
  malformed choices are repaired, and deterministic alternatives preserve a useful choice set.
- Scenario turn counts are pacing targets rather than abrupt endings. The roleplay waits for an
  in-character closing while retaining a bounded safety margin.
- Journey and Settings use the same application shell, sidebar navigation, search affordance, and
  section navigation model as Chat. Long Journey content is divided into focused views.
- Journey counts, relationship summaries, last-chat dates, model labels, and seeded timestamps are
  derived consistently from stored data.
- The demo dataset now contains a richer multi-NPC conversation history, completed scenarios,
  relationship progression, memory examples, achievements, a seven-day streak, and three Learning
  Focus skills suitable for screenshots and assessment walkthroughs.
- The memory evaluation harness includes a larger deterministic fixture set and a LongMemEval-S
  adapter so the report can distinguish controlled ablation from a public retrieval benchmark.

## Submission engineering

- Pinned the repository to Node `24.19.0` with `.nvmrc`, `engines`, `.npmrc`, and a fail-fast version
  check.
- Added a fixed `DEMO_SEED_NOW` anchor so relative demo dates can be reproduced exactly.
- Added `npm run demo`: Vite builds the SPA, then Hono serves both static assets and `/api/*` from a
  single origin and port. Client-side routes use an SPA fallback; hashed assets use immutable cache
  headers.
- Added `npm run verify`: replay migrations and both seeds on a new temporary SQLite database,
  typecheck both workspaces, run all tests, and create the production bundle without Ollama.
- Added `npm run verify:eval` for the model- and dataset-dependent memory evaluation. It is not part
  of the deterministic green release gate.
- Added `FINAL_SUBMISSION_CHECKLIST.md` as the freeze rule and final handoff checklist.

## Verification record

All checks below ran on Node `24.19.0`:

- `npm run verify`: passed.
- Fresh temporary database: all 13 migrations, base seed, and fixed-anchor demo seed passed.
- API: 101 test files and 355 tests passed.
- Web: 7 test files and 34 tests passed.
- API and Web typechecks: passed.
- Vite production build: passed; the JavaScript bundle is approximately 280 kB before gzip and
  81 kB after gzip.
- Single-port HTTP checks: `/`, SPA fallback, static asset MIME/cache headers, health API, and API
  404 behavior passed.
- Browser QA: Chat, Journey Overview, Learning, and Settings rendered without console warnings or
  errors; sidebar section switching and Learning Focus actions responded correctly.
- Live smoke on a disposable database: streaming chat, NPC-specific context, inline Scenario offer,
  accept, roleplay entry, and End-to-chat flow passed.
- `npm run verify:eval`: passed. LongMemEval-S completed 60 stratified non-abstention questions with
  Recall@5 of 0.624 for semantic retrieval and 0.346 for hybrid retrieval.
- `git diff --check`: passed; local databases, `.env`, build output, and toolchain caches remain
  ignored.

## Version-control record

- Starting baseline: `0c86c9724e86579fcc08bf32229f5e880b1bb5c1`.
- Frozen code, tests, demo tooling, and submission documentation:
  `2c7ce7b919caedc13c2558835c5e725e76b577f0`.
- The committed LongMemEval-S report was regenerated from a clean checkout of `2c7ce7b`; its JSON
  and Markdown metadata record that full commit identifier without a dirty-worktree suffix.

The retrieval effectiveness values were stable across the final runs. Latency is retained as a
host-specific observation rather than treated as an algorithm-independent result.
