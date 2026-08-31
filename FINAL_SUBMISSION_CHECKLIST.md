# Final Submission Checklist

This file is the release gate for the Popcorn Language capstone submission.

## Freeze rule

During the submission freeze, only fix:

1. Runtime crashes or data inconsistencies.
2. Regressions that make an already committed test fail.
3. A concrete mismatch between behavior described in the submitted report and the code.

Do not add UI polish, new features, broad refactors, or major dependency upgrades during the freeze.

## Reproducible toolchain

- [x] Node is pinned to `24.19.0` in `.nvmrc`.
- [x] `package.json` accepts Node 24 only and `.npmrc` enforces engines during install.
- [x] `npm run verify` rejects a different Node version before doing other work.
- [x] Demo dates can be anchored with `DEMO_SEED_NOW`.

## Clean setup

```bash
nvm install
nvm use
npm install
cp apps/api/.env.example apps/api/.env
npm run db:migrate
npm run db:seed
npm run db:seed:demo
```

## Submission verification

The green release gate is fully offline and deterministic:

```bash
npm run verify
```

It must complete all of the following:

- [x] Replay every migration against a new temporary SQLite database.
- [x] Run the base and demo seeds at a fixed time anchor.
- [x] Typecheck the API and Web workspaces.
- [x] Pass the complete API and Web test suites.
- [x] Produce the Vite production bundle.

The report evaluation is separate because it needs Ollama and the LongMemEval dataset:

```bash
npm run verify:eval
```

- [x] Regenerate the deterministic memory ablation report.
- [x] Run LongMemEval-S retrieval with `nomic-embed-text`.
- [ ] Confirm generated report data matches the values cited in the dissertation.

## Single-port demo

```bash
npm run db:seed:demo
npm run demo
```

- [x] `http://localhost:3100/` serves the React application.
- [x] Client-side routes such as `/onboarding` and `/settings` survive direct navigation.
- [x] `/assets/*` files have the correct MIME type and immutable cache headers.
- [x] `/api/system/health` is served from the same origin.
- [x] `demo` / `demo` can sign in and reach Chat, Journey, Settings, and Scenario review.
- [x] Live chat and scenario generation work with the configured Ollama models.

Optional automated checks while the single-port app is running:

```bash
DEMO_WEB_URL=http://localhost:3100 DEMO_API_URL=http://localhost:3100 npm run demo:check
DEMO_WEB_URL=http://localhost:3100 npm run smoke:web -- journey
```

## Repository and report

- [x] `git diff --check` reports no whitespace errors.
- [x] No database, model, cache, screenshot, or secret file is staged.
- [x] Schema migrations required by the current Prisma schema are committed.
- [x] README commands work from a fresh checkout.
- [ ] Final report screenshots and behavior descriptions match the frozen product.
- [ ] Final change log records the exact verification results and commit identifiers.
- [ ] The final branch is pushed only after the local release gate is green.

## Assessed scope

The submission is a single-machine course-project build. SQLite, the lightweight account layer,
and Ollama are deliberate choices for a reproducible assessed experience. Public multi-tenant
hosting, a production identity provider, mobile clients, additional scenario content, and major
dependency migrations are future-work items rather than release blockers.
