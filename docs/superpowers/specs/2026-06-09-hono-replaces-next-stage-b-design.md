# Design — Hono replaces Next (Phase 2, Stage B)

**Date:** 2026-06-09
**Status:** Approved for planning
**Scope:** Stage B of the three-stage backend modernization. Swap the server framework; **behavior stays identical**.

---

## 0. Context

Phase 2 replaces Next.js with Hono in three shippable stages. **Stage A is done** (merged `main` @ `79b6cc2`): the repo is an npm-workspaces monorepo with the backend at `apps/api` (Next still serving the API on :3100) and the Vite SPA at `apps/web`. **This is Stage B**: replace Next with Hono inside `apps/api`. **Stage C** (later) adds `packages/shared` zod schemas + a typed RPC client.

The migration surface was inspected: all 34 route handlers are already Web-standard `(req: Request, { params }) => Promise<Response>`; SSE returns a plain `Response`; auth (`withUser`) is self-contained inside each handler. The **only** Next-specific code in the 34 routes is one line in `system/health/route.ts` (`NextResponse.json`). There is no `middleware.ts`, no `next/headers`, no `cookies()`.

## 1. Goals / Non-goals

**Goals**
- Serve all 34 API routes from a **Hono** app on :3100 (port unchanged → the Vite proxy and `scripts/smoke-web.mjs` are untouched), with **identical behavior**.
- **Reuse the 34 handler bodies verbatim** via a thin adapter (the handlers stay at `src/app/api/<path>/route.ts`).
- Remove Next.js entirely (deps, config, `dynamic` exports, the one `NextResponse` line, tsconfig plugin).
- Migrate the ~30 integration tests that invoke handlers directly to Hono's in-process `app.request()`; leave the `src/server/*` unit tests untouched.

**Non-goals (Stage B)**
- `packages/shared`, zod schema extraction, the RPC client (Stage C).
- Reorganizing handler files out of `src/app/api/` (deliberately deferred — minimal churn).
- Any change to request/response shapes, status codes, SSE frames, auth, the DB, or the SPA.
- Performance work, new endpoints, or auth hardening.

## 2. Architecture

```
apps/api/src/
├─ app/api/<path>/route.ts     ← UNCHANGED handlers (reused via adapter); only health/route.ts edited
├─ http/
│  ├─ adapt.ts                 ← Next-handler → Hono-handler adapter (3 lines)
│  └─ app.ts                   ← the Hono app: imports + mounts all 34 routes; exports `app` (and `AppType` for Stage C)
└─ index.ts                    ← @hono/node-server entry: loads .env, serves app.fetch on :3100
```

The Hono `app` lives in `src/http/app.ts` and is **exported without starting a server**, so tests import it and call `app.request(...)` in-process. `src/index.ts` is the only place that binds a port.

## 3. The adapter + mounting

`src/http/adapt.ts`:
```ts
import type { Context } from 'hono';
type NextHandler = (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;
export const adapt = (h: NextHandler) => (c: Context) => h(c.req.raw, { params: c.req.param() });
```
- `c.req.raw` is the standard `Request` the handlers already accept.
- `c.req.param()` returns all path params as the `{ params }` object the handlers expect. Handlers that take no params (e.g. `GET(req)`) ignore the extra arg (TypeScript allows passing a 1-arg handler where a 2-arg signature is expected).

`src/http/app.ts` mounts every route, mapping Next dynamic segments `[x]` → Hono `:x`. Routes are grouped for readability (auth, profile/onboarding, npcs, threads, scenarios, journey, memories, achievements, settings, system, dev), e.g.:
```ts
import { GET as npcsGET } from '@/app/api/npcs/route';
import { GET as threadMessagesGET, POST as threadMessagesPOST } from '@/app/api/threads/[npcId]/messages/route';
// …
app.get('/api/npcs', adapt(npcsGET));
app.get('/api/threads/:npcId/messages', adapt(threadMessagesGET));
app.post('/api/threads/:npcId/messages', adapt(threadMessagesPOST));  // SSE — returns sseResponse() verbatim
```
Routes with multiple methods are mounted once per method. The complete path/method/handler table is enumerated in the plan.

## 4. SSE and auth — no change

- **SSE**: the messages-POST and scenario `choose`/`freetype` handlers return `sseResponse(gen)`, which is already a `new Response(ReadableStream, { headers })`. Hono returns it verbatim — no Hono `streamSSE` helper needed.
- **Auth**: each handler calls `withUser(req, fn)` / `requireUser(req)` internally, reading `req.headers.get('cookie')`. Unchanged — no Hono middleware required this stage.

## 5. Removing Next

- **The one required code fix:** `apps/api/src/app/api/system/health/route.ts` — replace `import { NextResponse } from 'next/server'` + `NextResponse.json(x)` with the shared `json(x)` helper from `@/server/http/respond` (removing `next` breaks this import, so this edit is mandatory).
- **`export const dynamic = 'force-dynamic'`** lines: harmless dead string exports once Next is gone; **left in place** this stage to avoid editing 33 files (a later cosmetic sweep can remove them).
- **Delete:** `apps/api/next.config.js`, `apps/api/next-env.d.ts`.
- **Deps:** drop `next`, `react`, `react-dom`, `@types/react`, `@types/react-dom` from `apps/api` (no React/JSX in the backend); add `hono` + `@hono/node-server` (and `dotenv`); keep `@prisma/client`, `zod`, `prisma`, `tsx`, `typescript`, `vitest`, `@types/node`.
- **`apps/api/tsconfig.json`:** remove the `{ "name": "next" }` plugin and the Next-artifact `include` entries (`next-env.d.ts`, `.next/types/**`); drop `jsx: "preserve"` and `allowJs`. **Keep the existing `lib` (including `DOM`/`DOM.Iterable`)** so the global `Request`/`Response`/`ReadableStream`/`fetch` types the handlers were written against do not drift. `include` becomes `["src", "tests"]`.

## 6. Runtime / dev / env

- `apps/api/src/index.ts`:
  ```ts
  import 'dotenv/config';                 // load apps/api/.env (DATABASE_URL, OLLAMA_*) for the non-Next runtime
  import { serve } from '@hono/node-server';
  import { app } from './http/app';
  serve({ fetch: app.fetch, port: 3100 }, (i) => console.log(`API on http://localhost:${i.port}`));
  ```
  `dotenv/config` does not override variables already in `process.env`, so the smoke's shell-set `OLLAMA_BASE_URL` still wins (same as under Next).
- **`apps/api` scripts:** `dev` → `tsx watch src/index.ts`; `start` → `tsx src/index.ts`; remove `build` (no build step for a tsx-run server); `test`/`test:watch`/`typecheck`/`db:*`/`report:ablation` unchanged. **Root scripts:** drop `build:api`; `dev:api` (`npm run dev -w apps/api`) now runs the Hono dev server; everything else unchanged.

## 7. Test migration

The ~30 integration tests that do `import { GET/POST } from '@/app/api/.../route'` and call the handler directly migrate to Hono's in-process client:
```ts
import { app } from '@/http/app';
const res = await app.request('/api/threads/lily/messages', {
  method: 'POST',
  headers: { cookie: `${SESSION_COOKIE}=${userId}` },
  body: JSON.stringify({ text: 'hi' }),
});
expect(res.status).toBe(200);
```
`app.request()` runs the full Hono routing + handler in-process (no server, no port), returning the same `Response` the tests already assert on (status, headers, `res.text()`/`res.json()`, SSE body). DB-backed assertions via `prisma` are unchanged. The `src/server/*` unit tests (cosine, prompt-builder, scenario-state, etc.) do not touch routes and are untouched.

## 8. Verification (the gate)

- `npm install` (root) resolves; `apps/api` typecheck + `apps/web` typecheck exit 0.
- Backend suite (`npm test`) passes at the **same profile** as before (the one Ollama-gated SSE test excepted when Ollama is absent).
- `npm run dev` brings up the Hono API (:3100) + Vite (:5173); `node scripts/smoke-web.mjs all` → **SMOKE PASS** (api/chat/journey/scenario), proving every endpoint — including the 3 SSE endpoints — behaves identically through Hono.
- No `next`/`react` remain in `apps/api/package.json`; `grep` finds no `next/server`/`NextResponse` in `apps/api/src`.

## 9. Out of scope (Stage B → Stage C)

`packages/shared` zod schemas, typed `hc<AppType>()` RPC client replacing `apps/web/src/api/client.ts`, removing the `dynamic` dead exports, and any handler-file reorganization out of `src/app/api/`.

## 10. Risks & mitigations

- **A route missed or mis-mapped** (wrong path/method/param). Mitigated by enumerating the full route table in the plan and by the `smoke all` + full backend suite gate, which exercises every flow.
- **Global type drift** (Request/Response) from tsconfig changes. Mitigated by **keeping the `DOM` lib** so handler types are unchanged.
- **.env not loaded** for the non-Next runtime. Mitigated by `import 'dotenv/config'` in `index.ts` (prisma also self-loads `DATABASE_URL`; the Ollama client defaults to :11434).
- **SSE buffering** differences under Hono/node-server. Mitigated by returning the existing `sseResponse` `Response` verbatim and validating the streaming chat flow in `smoke all`.
