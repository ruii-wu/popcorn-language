# Design — Monorepo restructure (Phase 2, Stage A)

**Date:** 2026-06-09
**Status:** Approved for planning
**Scope:** Stage A of a three-stage backend modernization. This stage changes structure only — **zero behavior change**.

---

## 0. Context — Phase 2 in three stages

Phase 1 (done, merged `72764ee`) moved the frontend to a Vite SPA in `web/`, with Next.js kept as the API backend reached via a `/api` proxy. Phase 2 replaces Next.js with **Hono** and adds end-to-end type safety, delivered in three independently-shippable stages (each its own spec → plan → branch → verify → merge):

- **Stage A (this spec): monorepo restructure.** Convert the flat repo into an npm-workspaces monorepo (`apps/web`, `apps/api`). Next.js still runs — just relocated. No behavior change.
- **Stage B (later): Hono replaces Next.** Mount the (already Web-standard) route handlers on a Hono app, reuse `sseResponse` for SSE, delete Next.
- **Stage C (later): shared zod + typed RPC.** `packages/shared` holds the zod request schemas; `apps/web` consumes a type-only `hc<AppType>()` RPC client, retiring the hand-written `web/src/api/client.ts`.

This spec covers **Stage A only**.

## 1. Goals / Non-goals

**Goals**
- Establish an npm-workspaces monorepo: `apps/web` + `apps/api` (+ a `packages/*` glob ready for Stage C).
- Relocate the Vite SPA to `apps/web/` and the entire backend (Next API routes, `src/server`, `prisma`, `tests`, configs, `.env`) to `apps/api/`.
- Split today's root `package.json` into a thin **workspace-root** package (orchestration + workspaces) and a **`apps/api`** package (the backend deps/scripts).
- **Zero behavior change.** Next.js still serves the API on :3100; Vite still serves the SPA on :5173 and proxies `/api` to it. Every backend test and the full browser smoke pass exactly as before.

**Non-goals (Stage A)**
- Hono / removing Next (Stage B).
- `packages/shared`, zod extraction, RPC client (Stage C).
- Any change to runtime behavior, API responses, the DB schema, or the SPA UI.
- Touching `public/app/` (the legacy `design-canvas.html` stays where it is).

## 2. Target layout after Stage A

```
popcorn_language/                 ← npm workspaces root (thin package.json)
├─ package.json                   (private; "workspaces": ["apps/*","packages/*"]; orchestration scripts; concurrently)
├─ scripts/smoke-web.mjs          ← stays at root (repo-level e2e; drives web+api)
├─ apps/
│  ├─ web/                        ← today's web/ moved here verbatim (Vite SPA)
│  │  └─ (package.json, vite.config.ts, src/, …)   unchanged except location
│  └─ api/                        ← the backend, relocated
│     ├─ package.json             (name popcorn-api; next/@prisma/client/react/react-dom/zod; prisma seed cfg; backend scripts)
│     ├─ next.config.js  next-env.d.ts  tsconfig.json  vitest.config.ts
│     ├─ .env  .env.example
│     ├─ src/app/api/…  src/server/…       (moved from src/)
│     ├─ prisma/                  (schema, migrations, seeds, dev.db)
│     └─ tests/                   (unit + integration)
└─ public/app/                    ← untouched (legacy design-canvas.html)
```

## 3. Key principle — the `@/*` alias absorbs most import churn

Backend code imports via the `@/*` path alias (`@/server/…`, `@/app/api/…`), and the tests import handlers via `@/app/api/.../route`. The alias currently maps `@/* → src/*`. After moving `src/ → apps/api/src/`, redefining the alias as `@/* → src/*` inside `apps/api/tsconfig.json` (and the relocated `apps/api/vitest.config.ts` `resolve.alias`) keeps **every internal import resolving unchanged**. This is what makes a large move low-risk: we move directories and fix a handful of *config* paths, not hundreds of import statements.

## 4. What moves and what splits

**Moves (relocate as-is):**
- `web/` → `apps/web/`
- `src/` → `apps/api/src/`; `prisma/` → `apps/api/prisma/`; `tests/` → `apps/api/tests/`
- `next.config.js`, `next-env.d.ts`, `tsconfig.json`, `vitest.config.ts`, `.env`, `.env.example` → `apps/api/`
- `scripts/smoke-web.mjs` stays at the repo root.

**`package.json` split** (today's root package is the backend's):
- **`apps/api/package.json`** (new): backend deps (`next`, `@prisma/client`, `react`, `react-dom`, `zod`) + devDeps (`prisma`, `tsx`, `typescript`, `vitest`, `@types/*`) + the backend scripts (`dev` = `next dev -p 3100`, `build`, `test`, `db:*`, `typecheck`, `report:ablation`, `db:seed:demo`) + the `"prisma": { "seed": … }` block. (`react`/`react-dom` remain only because Next still needs them this stage; Stage B drops them with Next.)
- **root `package.json`** (rewritten thin): `private`, `"workspaces": ["apps/*","packages/*"]`, `concurrently` devDep, `playwright` devDep (kept at root for the smoke), and orchestration scripts:
  - `dev` → `concurrently` of `dev:api` (`npm --prefix apps/api run dev`) and `dev:web` (`npm --prefix apps/web run dev`)
  - `test` → `npm --prefix apps/api test`; `typecheck` → both apps; `smoke:web` → `node scripts/smoke-web.mjs`; `db:*`/`db:seed:demo`/`report:ablation` → delegate to `apps/api`.

**Config-path fixes (the only non-mechanical edits):**
- `apps/api/tsconfig.json`: `@/* → src/*` (now resolved relative to `apps/api`); keep the Next plugin/`jsx: preserve` for this stage.
- `apps/api/vitest.config.ts`: `resolve.alias` `@ → apps/api/src` (relative), `include: ['tests/**/*.test.ts']` unchanged.
- No root-level `tsconfig.json` remains: today's root `tsconfig.json` **is** the backend's and moves to `apps/api/`; `apps/web` already owns its own. The workspace root needs no tsconfig in this stage.
- `.env` `DATABASE_URL=file:./dev.db` is resolved relative to the schema dir, so it stays correct once `prisma/` and `.env` live under `apps/api/`.

## 5. dev.db handling

`dev.db` is a git-ignored local SQLite file (today at `prisma/dev.db`). After the move it lives at `apps/api/prisma/dev.db`. It is recreated in place by running, from `apps/api`, `npm run db:migrate && npm run db:seed && npm run db:seed:demo` — no data of value is lost (it's seed/demo data). The verification gate depends on the demo seed being present in the new location.

## 6. Dev / build / run after Stage A

- `npm install` at the root installs all workspaces (hoisted `node_modules`).
- `npm run dev` (root) → `concurrently` brings up Next API on :3100 (`apps/api`) and Vite on :5173 (`apps/web`); the Vite `/api` proxy target is unchanged (:3100). Ports unchanged (3000 still avoided).
- `npm test` (root) runs the backend suite in `apps/api`. `apps/web` keeps its own `npm --prefix apps/web run test` (the parseFrame unit test).

## 7. Verification (the gate)

Behavior is provably unchanged:
- `npm install` at root succeeds; both workspaces resolve.
- `npm --prefix apps/api run typecheck` and `npm --prefix apps/web run typecheck` both exit 0.
- `npm --prefix apps/web run build` succeeds.
- Backend suite (`npm test` → `apps/api`) passes exactly as before the move (same pass/fail profile; the one Ollama-dependent SSE test remains environment-gated, not a regression).
- `npm run db:seed:demo` then `npm run dev`, then `node scripts/smoke-web.mjs all` → **SMOKE PASS** across api/chat/journey/scenario.

## 8. Out of scope (Stage A)

Hono and removing Next (Stage B); `packages/shared`, zod extraction, the RPC client (Stage C); any runtime/behavior/UI/schema change; `public/app/`.

## 9. Risks & mitigations

- **Config-path breakage** (tsconfig/vitest alias, prisma seed path, `.env`/`DATABASE_URL`, Next root). Mitigated by the `@/*` alias (no import edits) and the full test + `smoke all` gate, which fails loudly if any path is wrong.
- **`package.json` split errors** (a backend dep left at root or vice-versa). Mitigated by `npm install` + typecheck + test catching missing deps.
- **dev.db not seeded in the new location** → smoke/integration failures unrelated to code. Mitigated by an explicit reseed step before the gate.
