# Monorepo Restructure (Phase 2, Stage A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this is a tightly-coupled sequential restructure (not independent tasks), so use **superpowers:executing-plans** (inline, with checkpoints) rather than subagent-per-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the flat repo into an npm-workspaces monorepo — `apps/web` (the Vite SPA) + `apps/api` (the Next.js backend, `src/server`, prisma, tests) — with **zero behavior change**.

**Architecture:** Relocate directories with `git mv` (preserve history); the `@/*` TS alias and the vitest `@` alias use paths relative to their own config files, so they keep resolving once `tsconfig.json`/`vitest.config.ts` move into `apps/api` alongside `src/`. Split the current root `package.json` (which is the backend's) into a thin workspace-root package + a new `apps/api` package. Next.js still serves the API on :3100; Vite still serves the SPA on :5173 and proxies `/api`.

**Tech Stack:** npm workspaces, Next.js 14 (unchanged this stage), Vite 5, Prisma/SQLite, Vitest, Playwright (root-level smoke).

**Conventions (read once, applies to all tasks):**
- **Branch:** do all work on `feat/monorepo-stage-a` (Task 0). Never commit to `main` directly.
- **EOL policy:** repo is `core.autocrlf=true`, no `.gitattributes`. Commit with **plain `git`** — never `-c core.autocrlf=false`. The "LF will be replaced by CRLF" warning is expected.
- **Do not stage** the pre-existing working-tree changes `.claude/settings.local.json` and `docs/reports/memory-ablation.md`, nor `outputs/`. Only stage the exact paths each task names. (After the moves, `docs/` stays at the repo root.)
- **Windows 11**, PowerShell default + Bash available. Microsoft Edge installed (Playwright `channel: 'msedge'`).
- This stage makes **no runtime/behavior/UI/schema change**. If a verification reveals a behavior difference, stop and investigate — the move broke a path.

---

## Task 0: Branch

- [ ] **Step 1: Create and switch to the branch**

Run:
```bash
git checkout -b feat/monorepo-stage-a
```
Expected: `Switched to a new branch 'feat/monorepo-stage-a'`

- [ ] **Step 2: Record the tracked-file count (a guard against losing files in the move)**

Run:
```bash
git ls-files | wc -l
```
Expected: prints a number (e.g. ~190). **Write it down** — Task 1 confirms the count is unchanged after the moves (moves must not drop or add tracked files).

---

## Task 1: Relocate directories with `git mv`

**Files:** moves only (no content edits).

- [ ] **Step 1: Create the `apps/api` directory**

`apps/web` will be created by the rename in Step 2; `apps/api` must exist before moving things into it.
```bash
mkdir -p apps/api
```

- [ ] **Step 2: Move the web app**

```bash
git mv web apps/web
```

- [ ] **Step 3: Move the backend code, prisma, tests, and configs into `apps/api`**

```bash
git mv src apps/api/src
git mv prisma apps/api/prisma
git mv tests apps/api/tests
git mv next.config.js apps/api/next.config.js
git mv tsconfig.json apps/api/tsconfig.json
git mv vitest.config.ts apps/api/vitest.config.ts
git mv .env.example apps/api/.env.example
```
(Do NOT move `next-env.d.ts` — it is git-ignored and Next regenerates it under `apps/api`. Do NOT move `scripts/`, `docs/`, `public/`, `README.md`, or `package.json` — those stay at the repo root. The root `package.json` is rewritten in Task 2.)

- [ ] **Step 4: Move the local `.env` (untracked) if it exists**

`.env` is git-ignored, so `git mv` won't handle it. Move it with the filesystem so the backend (run from `apps/api`) finds `DATABASE_URL`/`OLLAMA_*`:
```bash
# PowerShell:  if (Test-Path .env) { Move-Item .env apps/api/.env }
# Bash:
[ -f .env ] && mv .env apps/api/.env || echo ".env not present (will create from example in Task 4)"
```

- [ ] **Step 5: Verify no tracked files were lost and the moves registered as renames**

```bash
git ls-files | wc -l          # must equal the number from Task 0 Step 2
git status --short | grep -E '^R' | head -5   # expect rename (R) entries
```
Expected: identical file count; `git status` shows renames (e.g. `R  web/... -> apps/web/...`). Also confirm the new tree exists:
```bash
ls apps/api && ls apps/api/src && ls apps/web
```
Expected: `apps/api` contains `src prisma tests next.config.js tsconfig.json vitest.config.ts .env.example` (+ `.env` if it existed); `apps/web` contains the Vite app.

- [ ] **Step 6: Commit the moves**

```bash
git add -A apps web src prisma tests next.config.js tsconfig.json vitest.config.ts .env.example
git commit -m "chore: relocate web -> apps/web and backend -> apps/api (Stage A moves)"
```
(The repo is intentionally in a non-building intermediate state after this commit — the root `package.json` still points at old paths. Task 2 fixes that. `git add -A` here only stages the renames; confirm with `git status` that `.claude/settings.local.json` and `docs/reports/memory-ablation.md` remain unstaged.)

---

## Task 2: Split `package.json` (workspace root + `apps/api`)

**Files:**
- Create: `apps/api/package.json`
- Rewrite: `package.json` (root)

- [ ] **Step 1: Create `apps/api/package.json`** (the backend package — lifted from today's root package, web/orchestration bits removed)

```json
{
  "name": "popcorn-api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3100",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:reset": "prisma migrate reset --force",
    "db:generate": "prisma generate",
    "typecheck": "tsc --noEmit",
    "report:ablation": "vitest run tests/integration/ablation-report",
    "db:seed:demo": "tsx prisma/seed-demo.ts"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "5.18.0",
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "20.14.15",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "prisma": "5.18.0",
    "tsx": "4.17.0",
    "typescript": "5.5.4",
    "vitest": "2.0.5"
  }
}
```
(`react`/`react-dom`/`@types/react*` stay only because Next still requires them this stage; Stage B removes them with Next.)

- [ ] **Step 2: Rewrite the root `package.json`** as a thin workspace root

Replace the entire file with:
```json
{
  "name": "popcorn-language",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "concurrently -n api,web -c blue,green \"npm:dev:api\" \"npm:dev:web\"",
    "dev:api": "npm run dev -w apps/api",
    "dev:web": "npm run dev -w apps/web",
    "build:api": "npm run build -w apps/api",
    "build:web": "npm run build -w apps/web",
    "test": "npm run test -w apps/api",
    "typecheck": "npm run typecheck -w apps/api && npm run typecheck -w apps/web",
    "db:migrate": "npm run db:migrate -w apps/api",
    "db:seed": "npm run db:seed -w apps/api",
    "db:seed:demo": "npm run db:seed:demo -w apps/api",
    "db:reset": "npm run db:reset -w apps/api",
    "db:generate": "npm run db:generate -w apps/api",
    "report:ablation": "npm run report:ablation -w apps/api",
    "smoke:web": "node scripts/smoke-web.mjs"
  },
  "devDependencies": {
    "concurrently": "8.2.2",
    "playwright": "1.60.0"
  }
}
```
(`concurrently` orchestrates the two dev servers; `playwright` stays at the root because `scripts/smoke-web.mjs` runs from the root. `packages/*` is in the workspaces glob for Stage C even though it has no members yet — that is valid.)

- [ ] **Step 3: Verify both package.json files are valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); JSON.parse(require('fs').readFileSync('apps/api/package.json','utf8')); console.log('both package.json valid')"
```
Expected: `both package.json valid`

- [ ] **Step 4: Commit**

```bash
git add package.json apps/api/package.json
git commit -m "chore: split package.json into workspace root + apps/api"
```

---

## Task 3: Unify the workspace install

**Files:** deletes old lockfiles/node_modules, regenerates root lockfile.

- [ ] **Step 1: Remove the pre-workspace install artifacts**

Workspaces use a single root lockfile and a hoisted `node_modules`. Remove the old separate ones so the install is clean:
```bash
# Bash:
rm -rf node_modules apps/web/node_modules apps/api/node_modules
rm -f package-lock.json apps/web/package-lock.json
```
(`apps/web/package-lock.json` existed from Phase 1's standalone install; it is replaced by the root lockfile.)

- [ ] **Step 2: Ensure `apps/api/.env` exists**

If Task 1 Step 4 did not move an existing `.env`, create one from the example so prisma/Next have `DATABASE_URL`:
```bash
# Bash:
[ -f apps/api/.env ] || cp apps/api/.env.example apps/api/.env
```
Expected: `apps/api/.env` exists.

- [ ] **Step 3: Install all workspaces from the root**

```bash
npm install
```
Expected: completes without errors; creates a hoisted `node_modules/` and a fresh root `package-lock.json` covering `popcorn-api` and `popcorn-web`. (npm may print workspace lines for `apps/api` and `apps/web`.)

- [ ] **Step 4: Verify both workspaces typecheck (proves all paths/aliases resolve after the move)**

```bash
npm run typecheck
```
Expected: exit 0 — runs `tsc --noEmit` in `apps/api` (the `@/*` alias resolves to `apps/api/src`) then in `apps/web`, both clean. If `apps/api` typecheck fails with module-not-found on `@/...`, the alias is wrong — but it should not be, because `apps/api/tsconfig.json` keeps `"@/*": ["./src/*"]` and `src` now lives at `apps/api/src`.

- [ ] **Step 5: Commit the unified lockfile**

```bash
git add package-lock.json apps/web/package-lock.json
git commit -m "chore: unify workspace install under a single root lockfile"
```
(`git add apps/web/package-lock.json` stages its deletion. Confirm `git status` shows the root `package-lock.json` added and `apps/web/package-lock.json` deleted; nothing else.)

---

## Task 4: Recreate the dev DB and run the full behavioral gate

**Files:** none (verification; `apps/api/prisma/dev.db` is git-ignored).

- [ ] **Step 1: Recreate and seed the database in its new location**

From the repo root (the `-w apps/api` form runs prisma in `apps/api`'s cwd, so it loads `apps/api/.env` and resolves `apps/api/prisma/schema.prisma`):
```bash
npm run db:reset -w apps/api
npm run db:seed:demo
```
Expected: `db:reset` (`prisma migrate reset --force`) drops/recreates `apps/api/prisma/dev.db`, applies all migrations, and runs the base seed (`seed.ts`); `db:seed:demo` then adds the rich `demo`/`demo` learner. Both exit 0.

- [ ] **Step 2: Backend test suite passes as before**

```bash
npm test
```
Expected: same pass profile as on `main` before Stage A — the suite passes except the single Ollama-dependent SSE streaming test (`tests/integration/messages-post.test.ts`, 5s timeout) which fails only when Ollama is absent. That one is environmental, not a regression. Any OTHER failure means a path broke in the move — investigate before continuing.

- [ ] **Step 3: Full runtime smoke across all routes**

Start both dev servers (background) with Ollama forced unreachable so the chat flow's composer re-enable goes through the fast error path:
1. `$env:OLLAMA_BASE_URL = "http://127.0.0.1:1"; npm run dev:api` (background)  — Next on :3100
2. `npm run dev:web` (background) — Vite on :5173
3. Wait for both: `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3100/api/system/health` → 200; `curl.exe -s -o NUL -w "%{http_code}" http://localhost:5173/` → 200
4. `node scripts/smoke-web.mjs all`
   Expected: **SMOKE PASS** — api/chat/journey/scenario all pass, proving the relocated backend + proxied SPA behave identically.
5. Stop both background servers.

- [ ] **Step 4: Confirm the dev orchestration works as one command**

```bash
# quick check that the combined dev script starts both (then Ctrl-C / stop):
npm run dev
```
Expected: `concurrently` brings up both `api` (:3100) and `web` (:5173). Stop it after confirming both are listening. (No commit for this task — it is verification. If Step 1–4 required a tiny fix, commit it with a clear message.)

---

## Task 5: Final verification & branch wrap-up

**Files:** none.

- [ ] **Step 1: Whole-branch sanity**

```bash
npm run typecheck          # both apps clean
npm run build:web          # Vite build succeeds
git status --short         # only the expected unstaged: .claude/settings.local.json, docs/reports/memory-ablation.md, outputs/
```
Expected: typecheck exit 0; web build ok; no stray staged changes.

- [ ] **Step 2: Confirm history was preserved as renames (not delete+add)**

```bash
git log --oneline -4
git diff --stat main..HEAD | tail -3
```
Expected: the three Stage-A commits; the diffstat shows renames rather than thousands of deletions+insertions for moved files (git detects the renames).

- [ ] **Step 3: Hand off to branch completion**

Use the **superpowers:finishing-a-development-branch** skill to complete `feat/monorepo-stage-a` (project convention: `merge --no-ff` into `main`, then push — confirm with the user before pushing). After merge, Stage B (Hono replaces Next) begins as its own spec → plan → cycle from the updated `main`.

---

## Notes on scope (from the spec)

- **Out of scope:** Hono / removing Next (Stage B); `packages/shared`, zod extraction, the RPC client (Stage C); any runtime/behavior/UI/schema change; `public/app/`.
- **Why no content edits to tsconfig/vitest:** their path references (`@/* → ./src/*`, `@ → ./src`, `include: tests/**`) are relative to the config file, which moves into `apps/api` alongside `src/` and `tests/` — so they keep resolving unchanged.
