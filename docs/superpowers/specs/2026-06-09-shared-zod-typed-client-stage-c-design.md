# Design — Shared zod + typed client (Phase 2, Stage C)

**Date:** 2026-06-09
**Status:** Approved for planning
**Scope:** Stage C (final) of the backend modernization — add a shared zod/types package and make the web client strongly typed. No Hono `hc` RPC.

---

## 0. Context

Phase 2 stages A (monorepo) and B (Hono replaces Next) are merged (`main` @ `3357fee`). The backend is a Hono app in `apps/api` mounting 34 handlers via an opaque adapter; the frontend is the Vite SPA in `apps/web` with a hand-written `apps/web/src/api/client.ts` (a 23-method `api.x()` object whose responses are typed `any`). This stage introduces `packages/shared` so request **and** response contracts have a single typed source, consumed by both sides.

**Decision (taken during design):** Use shared zod schemas + a strongly-typed hand-written client — **not** Hono's `hc<AppType>` RPC. `hc` would require rewriting all 34 handlers into Hono-native typed form (the Stage B adapter is opaque) and the 3 SSE routes don't fit `hc`'s JSON model — high churn/risk for marginal benefit on a solo local-demo.

## 1. Goals / Non-goals

**Goals**
- A `packages/shared` workspace exporting: the request **zod schemas** (single source) + their `z.infer` types, and the **response types** for what the client returns.
- API routes import the shared request schemas (replacing inline `z.object`) — the request contract is enforced on the server.
- The 23-method `api.x()` client surface is **unchanged** (all 19 call sites untouched) but **strongly typed**: request args from the shared schemas, responses from the shared response types.
- Response contracts are enforced on the server too: each GET handler annotates its output value with the shared response type (locks the shape; surfaces drift at `tsc`).
- Net effect: change a shared schema/type → both the API and the frontend fail to compile against the old shape.

**Non-goals**
- Hono `hc<AppType>` RPC; rewriting handlers into Hono-native form.
- Changing any request/response shape, status code, SSE frame, or runtime behavior — the schemas/types **mirror today's contracts exactly**.
- Typing individual SSE event payloads (the `onEvent({ type, data })` frames stay `data: unknown`; only the SSE **request** bodies are typed).
- Auth hardening, new endpoints, UI changes.

## 2. `packages/shared`

```
packages/shared/
├─ package.json     name "@popcorn/shared", private, type module; exports the TS source
├─ tsconfig.json
└─ src/
   ├─ index.ts      re-exports requests + responses
   ├─ requests.ts   the request zod schemas + `z.infer` types
   └─ responses.ts  the response TS types
```

- **requests.ts** holds the ~9 request bodies currently defined inline in routes: login, register, profile (PUT), settings (PUT), thread message send, scenario `choose` / `decline` / `freetype`, system `reset`, dev `memory-eval`. Each is a `z.object` plus an exported `z.infer` type (e.g. `LoginBody` / `type LoginBody`). The plan enumerates them by reading each route.
- **responses.ts** holds the response shapes the client returns, declared to mirror today's handler outputs exactly (e.g. `NpcListItem[]`, `JourneySummary`, `Profile`, `Settings`, `ScenarioSessionView`, …). The plan enumerates them by reading each handler's `out` object.

Both apps declare `"@popcorn/shared": "*"` as a workspace dependency.

## 3. API side (no route rewrite)

- **Requests:** each of the ~9 routes swaps `const Body = z.object({…})` for `import { <Body> } from '@popcorn/shared'` and keeps its existing `<Body>.safeParse(await req.json())` call. Handler logic, the adapter, and SSE are otherwise unchanged from Stage B.
- **Responses:** each GET handler annotates the value it returns with the shared response type — e.g. `const out: NpcListItem[] = npcs.map(…); return json(out);`. The handler still returns `json(out)`; the annotation simply locks the output to the shared contract and makes drift a compile error. (Where a handler's output is awkward to annotate cleanly, the response type is shaped to match the actual output rather than forcing a handler change.)

## 4. Web side

`apps/web/src/api/client.ts` keeps its `req`/`apiGet/Post/Put`/`streamPost`/`parseFrame` internals and its 23-method `api` object (so the 19 call sites are untouched), but:
- a typed `req<T>()` returns `Promise<T>`;
- each method declares its types from `@popcorn/shared` — request args use the `z.infer` request types (e.g. `saveProfile(p: ProfileBody)`, `saveSettings(s: SettingsBody)`); GET methods return the response types (e.g. `npcs(): Promise<NpcListItem[]>`).
- Typing the responses will surface any latent `any`-isms in the web components (`App.tsx`, `Onboarding.tsx`, `Scenario.tsx`, `shared.tsx`); those are fixed as part of this stage (that is the point — catching mismatches).

## 5. Workspace TS resolution

`@popcorn/shared` exports TS source (`"exports": { ".": "./src/index.ts" }`) — the monorepo has no per-package build step. Resolution per consumer:
- **`apps/api` (tsx runtime + vitest):** node resolves the workspace symlink; **tsx transpiles** the package's `.ts` on import. vitest may need the package inlined (`test.server.deps.inline` / `deps.inline`) to transform it — the plan wires and verifies this.
- **`apps/web` (Vite):** Vite processes workspace TS deps; a `resolve.alias` for `@popcorn/shared` is added if the optimizer needs it.
- **Typecheck:** each app's `tsconfig.json` resolves `@popcorn/shared` via node resolution (workspace symlink) or an added `paths` entry.

The plan nails the exact config and proves it with `tsc` + the runtime smoke (a request that hits a shared-schema-validated route, e.g. login).

## 6. Verification (the gate)

- `npm install` (root) links `@popcorn/shared`; `@popcorn/shared` + `apps/api` + `apps/web` all typecheck (exit 0).
- Backend suite passes at the same profile (the ~9 routes validate identically against the shared schemas; the one Ollama-gated SSE test excepted).
- `npm run dev` + `node scripts/smoke-web.mjs all` → **SMOKE PASS** (proves the shared schemas validate real requests — login/onboarding/chat/scenario — and the typed client returns correctly).
- A deliberate type check: temporarily changing a shared request schema (e.g. renaming a field) makes BOTH `apps/api` and `apps/web` typecheck fail — confirming end-to-end enforcement (revert after confirming).

## 7. Out of scope

Hono `hc` RPC; handler rewrites; SSE event-payload typing; the harmless `export const dynamic` dead exports; any behavior/UI change.

## 8. Risks & mitigations

- **Workspace TS resolution** (tsx / Vite / vitest transforming a TS-source dep). Mitigated by tsx's native TS transpile, a Vite alias / vitest `deps.inline` as needed, and the `tsc` + smoke gate that fails loudly if resolution breaks.
- **Response-type drift from handler output** surfacing many fiddly mismatches. Mitigated by deriving the response types from the *current* handler outputs (so annotations typecheck immediately) and by typing responses route-by-route with the suite/smoke as the safety net.
- **Component fallout** from newly-typed responses. Mitigated by fixing each surfaced mismatch (the intended benefit) and re-running `apps/web` typecheck.
