# Hono Replaces Next (Phase 2, Stage B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this is a coupled sequential migration (one evolving `apps/api`), so use **superpowers:executing-plans** (inline, with checkpoints). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace Next.js with a Hono app in `apps/api` that mounts all 34 existing route handlers verbatim on :3100, with identical behavior, then delete Next.

**Architecture:** A 3-line adapter turns each `(Request, { params }) => Promise<Response>` handler into a Hono handler (`c.req.raw` + `c.req.param()`). `src/http/app.ts` mounts all 37 method-routes and exports `app`; `src/index.ts` serves it via `@hono/node-server`. Handlers stay at `src/app/api/<path>/route.ts` and are unchanged (except one `NextResponse`→`json` fix), so the existing handler-level tests keep passing untouched; a new `hono-app.test.ts` asserts the full mount table.

**Tech Stack:** Hono 4 + `@hono/node-server`, `dotenv`, tsx, Prisma/SQLite, Vitest, Playwright (smoke). Next.js removed.

**Conventions (read once):**
- **Branch:** all work on `feat/hono-stage-b` (Task 0). Never commit to `main` directly.
- **EOL:** commit with plain `git` (repo is `core.autocrlf=true`); the CRLF warning is expected. Never `-c core.autocrlf=false`.
- **Do not stage** the pre-existing working-tree changes `.claude/settings.local.json`, `docs/reports/memory-ablation.md`, or `outputs/`. Stage only the paths each task names.
- **Windows 11**; Bash + PowerShell available; Microsoft Edge installed (Playwright `channel: 'msedge'`).
- Run workspace scripts with `-w apps/api` / `-w apps/web` from the repo root.
- **Process hygiene:** before any `npm run dev*`/smoke, ensure no stray `node` dev servers hold ports 3100/5173 (PowerShell: `Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force`). Stop background servers when done.

---

## Task 0: Branch

- [ ] **Step 1: Create and switch to the branch**

```bash
git checkout -b feat/hono-stage-b
```
Expected: `Switched to a new branch 'feat/hono-stage-b'`

---

## Task 1: Adapter + Hono app + health fix + mount-table test (TDD)

**Files:**
- Create: `apps/api/src/http/adapt.ts`, `apps/api/src/http/app.ts`, `apps/api/tests/integration/hono-app.test.ts`
- Modify: `apps/api/src/app/api/system/health/route.ts`
- Deps: add `hono`, `@hono/node-server`, `dotenv` to `apps/api`

- [ ] **Step 1: Add the Hono dependencies**

```bash
npm install hono @hono/node-server dotenv -w apps/api
```
Expected: installs without error; `apps/api/package.json` gains `hono`, `@hono/node-server`, `dotenv` in `dependencies`; the root lockfile updates.

- [ ] **Step 2: Write the failing mount-table test**

Create `apps/api/tests/integration/hono-app.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { app } from '@/http/app';

// The complete expected mounting table (34 route files -> 37 method-routes).
const EXPECTED: [string, string][] = [
  ['POST', '/api/auth/login'],
  ['POST', '/api/auth/logout'],
  ['POST', '/api/auth/register'],
  ['GET', '/api/auth/me'],
  ['GET', '/api/profile'],
  ['PUT', '/api/profile'],
  ['POST', '/api/onboarding/complete'],
  ['GET', '/api/npcs'],
  ['GET', '/api/npcs/:id'],
  ['DELETE', '/api/threads/:npcId'],
  ['GET', '/api/threads/:npcId/messages'],
  ['POST', '/api/threads/:npcId/messages'],
  ['POST', '/api/threads/:npcId/messages/:msgId/correction'],
  ['GET', '/api/scenarios/catalog'],
  ['GET', '/api/scenarios/sessions'],
  ['GET', '/api/scenarios/sessions/:id'],
  ['POST', '/api/scenarios/sessions/:id/accept'],
  ['POST', '/api/scenarios/sessions/:id/decline'],
  ['POST', '/api/scenarios/sessions/:id/choose'],
  ['POST', '/api/scenarios/sessions/:id/freetype'],
  ['POST', '/api/scenarios/sessions/:id/abort'],
  ['POST', '/api/scenarios/sessions/:id/pause'],
  ['POST', '/api/scenarios/sessions/:id/resume'],
  ['GET', '/api/memories'],
  ['GET', '/api/memories/recent'],
  ['DELETE', '/api/memories/:id'],
  ['GET', '/api/journey/summary'],
  ['GET', '/api/journey/relationships'],
  ['GET', '/api/journey/streak'],
  ['GET', '/api/achievements'],
  ['POST', '/api/achievements/generate'],
  ['GET', '/api/settings'],
  ['PUT', '/api/settings'],
  ['GET', '/api/system/health'],
  ['GET', '/api/system/models'],
  ['POST', '/api/system/reset'],
  ['POST', '/api/dev/memory-eval'],
];

describe('Hono app', () => {
  it('mounts every expected route at the right method + path', () => {
    expect(EXPECTED).toHaveLength(37);
    const have = new Set(app.routes.map((r) => `${r.method} ${r.path}`));
    const missing = EXPECTED.filter(([m, p]) => !have.has(`${m} ${p}`));
    expect(missing).toEqual([]);
  });

  it('401s a protected route called without a cookie', async () => {
    const res = await app.request('/api/npcs');
    expect(res.status).toBe(401);
  });

  it('404s an unknown path', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm run test -w apps/api -- hono-app
```
Expected: FAIL — cannot resolve `@/http/app` (file does not exist yet).

- [ ] **Step 4: Create the adapter**

Create `apps/api/src/http/adapt.ts`:
```ts
import type { Context } from 'hono';

// Adapt a Next-style route handler — (Request, { params }) => Promise<Response> —
// into a Hono handler. `c.req.raw` is the standard Request; `c.req.param()` is the params object.
// Generic over the ctx type so each handler keeps its specific `{ params: {...} }` typing.
export const adapt =
  <C extends { params: Record<string, string> }>(
    handler: (req: Request, ctx: C) => Promise<Response>,
  ) =>
  (c: Context): Promise<Response> =>
    handler(c.req.raw, { params: c.req.param() } as C);
```

- [ ] **Step 5: Fix the one Next-specific handler**

Edit `apps/api/src/app/api/system/health/route.ts` — replace the `next/server` import and call with the shared `json()` helper:
```ts
import { json } from '@/server/http/respond';
import { OllamaClient } from '@/server/llm/ollama';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const started = Date.now();
  const ollama = await new OllamaClient().health();
  return json({ server: 'up', uptimeMs: Date.now() - started, ollama });
}
```

- [ ] **Step 6: Create the Hono app that mounts every route**

Create `apps/api/src/http/app.ts`:
```ts
import { Hono } from 'hono';
import { adapt } from './adapt';

import * as authLogin from '@/app/api/auth/login/route';
import * as authLogout from '@/app/api/auth/logout/route';
import * as authRegister from '@/app/api/auth/register/route';
import * as authMe from '@/app/api/auth/me/route';
import * as profile from '@/app/api/profile/route';
import * as onboardingComplete from '@/app/api/onboarding/complete/route';
import * as npcs from '@/app/api/npcs/route';
import * as npcById from '@/app/api/npcs/[id]/route';
import * as threadByNpc from '@/app/api/threads/[npcId]/route';
import * as threadMessages from '@/app/api/threads/[npcId]/messages/route';
import * as correction from '@/app/api/threads/[npcId]/messages/[msgId]/correction/route';
import * as scenarioCatalog from '@/app/api/scenarios/catalog/route';
import * as scenarioSessions from '@/app/api/scenarios/sessions/route';
import * as scenarioSession from '@/app/api/scenarios/sessions/[id]/route';
import * as scenarioAccept from '@/app/api/scenarios/sessions/[id]/accept/route';
import * as scenarioDecline from '@/app/api/scenarios/sessions/[id]/decline/route';
import * as scenarioChoose from '@/app/api/scenarios/sessions/[id]/choose/route';
import * as scenarioFreetype from '@/app/api/scenarios/sessions/[id]/freetype/route';
import * as scenarioAbort from '@/app/api/scenarios/sessions/[id]/abort/route';
import * as scenarioPause from '@/app/api/scenarios/sessions/[id]/pause/route';
import * as scenarioResume from '@/app/api/scenarios/sessions/[id]/resume/route';
import * as memories from '@/app/api/memories/route';
import * as memoriesRecent from '@/app/api/memories/recent/route';
import * as memoryById from '@/app/api/memories/[id]/route';
import * as journeySummary from '@/app/api/journey/summary/route';
import * as journeyRelationships from '@/app/api/journey/relationships/route';
import * as journeyStreak from '@/app/api/journey/streak/route';
import * as achievements from '@/app/api/achievements/route';
import * as achievementsGenerate from '@/app/api/achievements/generate/route';
import * as settings from '@/app/api/settings/route';
import * as systemHealth from '@/app/api/system/health/route';
import * as systemModels from '@/app/api/system/models/route';
import * as systemReset from '@/app/api/system/reset/route';
import * as devMemoryEval from '@/app/api/dev/memory-eval/route';

export const app = new Hono();

// auth
app.post('/api/auth/login', adapt(authLogin.POST));
app.post('/api/auth/logout', adapt(authLogout.POST));
app.post('/api/auth/register', adapt(authRegister.POST));
app.get('/api/auth/me', adapt(authMe.GET));

// profile / onboarding
app.get('/api/profile', adapt(profile.GET));
app.put('/api/profile', adapt(profile.PUT));
app.post('/api/onboarding/complete', adapt(onboardingComplete.POST));

// npcs
app.get('/api/npcs', adapt(npcs.GET));
app.get('/api/npcs/:id', adapt(npcById.GET));

// threads
app.delete('/api/threads/:npcId', adapt(threadByNpc.DELETE));
app.get('/api/threads/:npcId/messages', adapt(threadMessages.GET));
app.post('/api/threads/:npcId/messages', adapt(threadMessages.POST)); // SSE
app.post('/api/threads/:npcId/messages/:msgId/correction', adapt(correction.POST));

// scenarios
app.get('/api/scenarios/catalog', adapt(scenarioCatalog.GET));
app.get('/api/scenarios/sessions', adapt(scenarioSessions.GET));
app.get('/api/scenarios/sessions/:id', adapt(scenarioSession.GET));
app.post('/api/scenarios/sessions/:id/accept', adapt(scenarioAccept.POST));
app.post('/api/scenarios/sessions/:id/decline', adapt(scenarioDecline.POST));
app.post('/api/scenarios/sessions/:id/choose', adapt(scenarioChoose.POST)); // SSE
app.post('/api/scenarios/sessions/:id/freetype', adapt(scenarioFreetype.POST)); // SSE
app.post('/api/scenarios/sessions/:id/abort', adapt(scenarioAbort.POST));
app.post('/api/scenarios/sessions/:id/pause', adapt(scenarioPause.POST));
app.post('/api/scenarios/sessions/:id/resume', adapt(scenarioResume.POST));

// memories
app.get('/api/memories', adapt(memories.GET));
app.get('/api/memories/recent', adapt(memoriesRecent.GET));
app.delete('/api/memories/:id', adapt(memoryById.DELETE));

// journey
app.get('/api/journey/summary', adapt(journeySummary.GET));
app.get('/api/journey/relationships', adapt(journeyRelationships.GET));
app.get('/api/journey/streak', adapt(journeyStreak.GET));

// achievements
app.get('/api/achievements', adapt(achievements.GET));
app.post('/api/achievements/generate', adapt(achievementsGenerate.POST));

// settings
app.get('/api/settings', adapt(settings.GET));
app.put('/api/settings', adapt(settings.PUT));

// system
app.get('/api/system/health', adapt(systemHealth.GET));
app.get('/api/system/models', adapt(systemModels.GET));
app.post('/api/system/reset', adapt(systemReset.POST));

// dev
app.post('/api/dev/memory-eval', adapt(devMemoryEval.POST));
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
npm run test -w apps/api -- hono-app
```
Expected: PASS — 3 passing (mount table complete, 401 without cookie, 404 unknown path).

- [ ] **Step 8: Typecheck**

```bash
npm run typecheck -w apps/api
```
Expected: exit 0. (Next is still installed, so the `next` tsconfig plugin is still present — that is fine this task.)

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/http/adapt.ts apps/api/src/http/app.ts apps/api/tests/integration/hono-app.test.ts apps/api/src/app/api/system/health/route.ts apps/api/package.json package-lock.json
git commit -m "feat(api): add Hono app mounting all 34 routes via an adapter (+ mount-table test)"
```

---

## Task 2: Server entry + dev scripts, validated by smoke

**Files:**
- Create: `apps/api/src/index.ts`
- Modify: `apps/api/package.json` (scripts)

- [ ] **Step 1: Create the server entry**

Create `apps/api/src/index.ts`:
```ts
import 'dotenv/config'; // load apps/api/.env (DATABASE_URL, OLLAMA_*) for the non-Next runtime
import { serve } from '@hono/node-server';
import { app } from './http/app';

const port = 3100;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API on http://localhost:${info.port}`);
});
```

- [ ] **Step 2: Point the `apps/api` scripts at the Hono server**

In `apps/api/package.json`, change `dev` and `start` and remove `build`. The `scripts` block becomes:
```json
"dev": "tsx watch src/index.ts",
"start": "tsx src/index.ts",
"test": "vitest run",
"test:watch": "vitest",
"db:migrate": "prisma migrate dev",
"db:seed": "prisma db seed",
"db:reset": "prisma migrate reset --force",
"db:generate": "prisma generate",
"typecheck": "tsc --noEmit",
"report:ablation": "vitest run tests/integration/ablation-report",
"db:seed:demo": "tsx prisma/seed-demo.ts"
```
(The `build` script — `next build` — is removed; a tsx-run server needs no build step.)

- [ ] **Step 3: Boot the Hono server and run the full smoke**

Ensure the demo DB is seeded (`npm run db:seed:demo`), then start both dev servers (Ollama forced unreachable so the chat error-path fires fast) and run the smoke:
1. background: `$env:OLLAMA_BASE_URL = "http://127.0.0.1:1"; npm run dev:api`  (now the Hono server on :3100)
2. background: `npm run dev:web`  (Vite :5173)
3. wait: `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3100/api/system/health` → 200; `curl.exe -s -o NUL -w "%{http_code}" http://localhost:5173/` → 200
4. `node scripts/smoke-web.mjs all`
   Expected: **SMOKE PASS** — api/chat/journey/scenario all pass against the Hono server (proving routing, params, cookies, and all 3 SSE endpoints work identically).
5. Stop both background servers.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/index.ts apps/api/package.json
git commit -m "feat(api): @hono/node-server entry on :3100; dev/start run via tsx"
```

---

## Task 3: Remove Next.js

**Files:**
- Delete: `apps/api/next.config.js`, `apps/api/next-env.d.ts`
- Modify: `apps/api/tsconfig.json`, `apps/api/package.json` (deps), `package.json` (root scripts)

- [ ] **Step 1: Drop the Next/React dependencies from `apps/api`**

```bash
npm uninstall next react react-dom @types/react @types/react-dom -w apps/api
```
Expected: removes them from `apps/api/package.json` and the lockfile. `apps/api` deps left: `@prisma/client`, `zod`, `hono`, `@hono/node-server`, `dotenv`; devDeps: `@types/node`, `prisma`, `tsx`, `typescript`, `vitest`.

- [ ] **Step 2: Delete the Next config and generated env file**

```bash
git rm apps/api/next.config.js
rm -f apps/api/next-env.d.ts
```
(`next-env.d.ts` is git-ignored, so a filesystem `rm` is enough.)

- [ ] **Step 3: Simplify `apps/api/tsconfig.json`** (drop the Next plugin/jsx/artifacts; KEEP the `DOM` lib so `Request`/`Response` types don't drift)

Replace the file with:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Remove the now-dead `build:api` root script**

In the root `package.json`, delete the line:
```json
"build:api": "npm run build -w apps/api",
```
(Leave `build:web`, `dev:api`, `dev:web`, and the rest unchanged. `dev:api` now runs the Hono dev server.)

- [ ] **Step 5: Reinstall and confirm Next is gone**

```bash
npm install
grep -rn "from 'next" apps/api/src ; echo "next-import grep exit: $?"
node -e "const p=require('./apps/api/package.json'); const bad=['next','react','react-dom'].filter(d=>p.dependencies[d]||(p.devDependencies||{})[d]); console.log(bad.length? 'STILL PRESENT: '+bad : 'no next/react deps')"
```
Expected: `npm install` succeeds; the `grep` prints nothing and reports `exit: 1` (no `next` imports remain in `apps/api/src`); the node check prints `no next/react deps`.

- [ ] **Step 6: Typecheck both workspaces**

```bash
npm run typecheck
```
Expected: exit 0 — `apps/api` (now Next-free) and `apps/web` both clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/tsconfig.json apps/api/package.json package.json package-lock.json
git commit -m "chore(api): remove Next.js (deps, config, tsconfig plugin); Hono is the server"
```

---

## Task 4: Final verification & branch wrap-up

**Files:** none (verification).

- [ ] **Step 1: Full backend suite + new Hono test green**

```bash
npm test
```
Expected: passes at the same profile as before — the existing handler-level tests + the new `hono-app.test.ts` all green, except the one Ollama-gated SSE test (`messages-post.test.ts`, 5s timeout) when Ollama is absent. Any OTHER failure means a route/handler broke — investigate.

- [ ] **Step 2: Full runtime smoke through the Hono server**

Seed demo (`npm run db:seed:demo`); start `$env:OLLAMA_BASE_URL="http://127.0.0.1:1"; npm run dev:api` + `npm run dev:web` (background); wait for :3100 health = 200 and :5173 = 200; then:
```bash
node scripts/smoke-web.mjs all
```
Expected: **SMOKE PASS** (api/chat/journey/scenario). Stop both servers after.

- [ ] **Step 3: Confirm Next is fully gone**

```bash
grep -rn "next/server\|NextResponse\|NextRequest" apps/api/src ; echo "exit: $?"
ls apps/api/next.config.js 2>/dev/null && echo "STILL EXISTS (bad)" || echo "next.config.js gone (good)"
```
Expected: grep prints nothing (`exit: 1`); `next.config.js gone (good)`.

- [ ] **Step 4: Branch completion**

Use **superpowers:finishing-a-development-branch** to complete `feat/hono-stage-b` (convention: `merge --no-ff` into `main`, then push — confirm with the user before pushing). After merge, Stage C (shared zod + RPC client) begins from the updated `main`.

---

## Notes on scope (from the spec)

- **Out of scope:** `packages/shared`, zod extraction, the RPC client (Stage C); removing the harmless `export const dynamic` dead exports; moving handlers out of `src/app/api/`.
- **Why the existing tests are not migrated:** the 34 handlers are unchanged and still importable, so the ~30 tests that call them directly keep passing. The Hono layer is covered by `hono-app.test.ts` (mount table) + `smoke all` (end-to-end).
