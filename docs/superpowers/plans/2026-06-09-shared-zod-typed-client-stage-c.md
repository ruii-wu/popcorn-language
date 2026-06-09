# Shared zod + Typed Client (Phase 2, Stage C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: coupled, cross-cutting typing work (shared package + API + web must agree), so use **superpowers:executing-plans** (inline, with checkpoints). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a `packages/shared` workspace holding the request zod schemas + response types, consumed by both `apps/api` (request validation + response annotations) and `apps/web` (a strongly-typed `api.x()` client), so contract changes fail to compile on both sides.

**Architecture:** No Hono `hc` RPC. `@popcorn/shared` exports TS source (no build step). The ~9 routes swap their inline `z.object` for the shared schema; GET handlers annotate their output with the shared response type; the web client keeps its 23-method surface but is fully typed. Request types are `z.infer` of shared schemas; response types are declared to mirror today's handler outputs.

**Tech Stack:** npm workspaces, zod, TypeScript, tsx/Vite/Vitest (all transpile the shared TS source), Playwright smoke.

**Conventions (read once):**
- **Branch:** all work on `feat/shared-types-stage-c`. Never commit to `main` directly.
- **EOL:** plain `git` (repo is `core.autocrlf=true`; CRLF warning expected). Never `-c core.autocrlf=false`.
- **Do not stage** `.claude/settings.local.json`, `docs/reports/memory-ablation.md`, `outputs/`.
- Windows 11; Bash + PowerShell; Edge installed. Run workspace scripts with `-w <workspace>` from the root.
- Before any `dev`/smoke, clear stray node: PowerShell `Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force`. Stop background servers when done.
- **No behavior change:** every schema/type mirrors today's contract exactly. If the suite or smoke shows a behavior difference, a schema/type is wrong — fix it, don't change the API.

---

## Task 0: Branch

- [ ] **Step 1:** `git checkout -b feat/shared-types-stage-c` → `Switched to a new branch`.

---

## Task 1: Scaffold `packages/shared` (with request schemas) + wire resolution

**Files:** Create `packages/shared/{package.json,tsconfig.json,src/index.ts,src/requests.ts,src/responses.ts}`; Modify `apps/api/package.json`, `apps/web/package.json` (add the dep), `apps/api/vitest.config.ts` (inline the dep).

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@popcorn/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "zod": "3.23.8"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/shared/src/requests.ts`** (the request schemas, lifted verbatim from the routes)

```ts
import { z } from 'zod';

// auth/login + auth/register (identical shape)
export const CredentialsBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type CredentialsBody = z.infer<typeof CredentialsBody>;

// profile PUT
export const ProfileBody = z.object({
  role: z.string().nullish(),
  goal: z.string().nullish(),
  interests: z.array(z.string()).default([]),
  language: z.string().optional(),
});
export type ProfileBody = z.infer<typeof ProfileBody>;

// threads/:npcId/messages POST
export const SendMessageBody = z.object({
  text: z.string().min(1),
  lang: z.string().optional(),
});
export type SendMessageBody = z.infer<typeof SendMessageBody>;

// system/reset POST
export const SystemResetBody = z.object({ confirm: z.literal(true) });
export type SystemResetBody = z.infer<typeof SystemResetBody>;

// scenarios/sessions/:id/decline POST
export const DeclineBody = z.object({ reason: z.string().max(500).optional() });
export type DeclineBody = z.infer<typeof DeclineBody>;

// scenarios/sessions/:id/choose POST
export const ChooseBody = z.object({
  choiceId: z.string().min(1),
  tone: z.string().optional(),
  text: z.string().optional(),
});
export type ChooseBody = z.infer<typeof ChooseBody>;

// scenarios/sessions/:id/freetype POST
export const FreetypeBody = z.object({ text: z.string().min(1) });
export type FreetypeBody = z.infer<typeof FreetypeBody>;

// dev/memory-eval POST
export const MemoryEvalBody = z.object({
  datasetId: z.string().optional(),
  k: z.number().int().positive().max(20).optional(),
});
export type MemoryEvalBody = z.infer<typeof MemoryEvalBody>;
```

- [ ] **Step 4: Create `packages/shared/src/responses.ts`** (placeholder until Task 4)

```ts
// Response types are added in Task 4 (one per client GET/POST method, mirroring handler output).
export {};
```

- [ ] **Step 5: Create `packages/shared/src/index.ts`**

```ts
export * from './requests';
export * from './responses';
```

- [ ] **Step 6: Add the workspace dependency to both apps**

In `apps/api/package.json` and `apps/web/package.json`, add to `dependencies`:
```json
"@popcorn/shared": "*"
```

- [ ] **Step 7: Make vitest transform the shared TS source**

In `apps/api/vitest.config.ts`, add a `server.deps.inline` entry so the backend tests (which will import routes that import `@popcorn/shared`) transform the TS source. The `test` block becomes:
```ts
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'web/**'],
    fileParallelism: false,
    server: { deps: { inline: [/@popcorn\/shared/] } },
  },
```

- [ ] **Step 8: Install and verify the shared package typechecks**

```bash
npm install
npm --prefix packages/shared exec tsc --noEmit || (cd packages/shared && npx tsc --noEmit)
```
Expected: `npm install` links `@popcorn/shared` into the workspace; `tsc --noEmit` in `packages/shared` exits 0.

- [ ] **Step 9: Commit**

```bash
git add packages/shared apps/api/package.json apps/web/package.json apps/api/vitest.config.ts package.json package-lock.json
git commit -m "feat(shared): scaffold @popcorn/shared with request zod schemas"
```

---

## Task 2: API routes import the shared request schemas

**Files:** Modify these 9 route files (replace the inline `z.object` with the shared schema; rename the local reference; drop the now-unused `import { z } from 'zod'` if `z` is otherwise unused in the file).

| Route file | Local name → shared name |
|---|---|
| `apps/api/src/app/api/auth/login/route.ts` | `Body` → `CredentialsBody` |
| `apps/api/src/app/api/auth/register/route.ts` | `Body` → `CredentialsBody` |
| `apps/api/src/app/api/profile/route.ts` | `PutBody` → `ProfileBody` |
| `apps/api/src/app/api/threads/[npcId]/messages/route.ts` | `PostBody` → `SendMessageBody` |
| `apps/api/src/app/api/system/reset/route.ts` | `Body` → `SystemResetBody` |
| `apps/api/src/app/api/scenarios/sessions/[id]/decline/route.ts` | `Body` → `DeclineBody` |
| `apps/api/src/app/api/scenarios/sessions/[id]/choose/route.ts` | `Body` → `ChooseBody` |
| `apps/api/src/app/api/scenarios/sessions/[id]/freetype/route.ts` | `Body` → `FreetypeBody` |
| `apps/api/src/app/api/dev/memory-eval/route.ts` | `Body` → `MemoryEvalBody` |

- [ ] **Step 1: Apply the swap to each file.** For each route: delete the line(s) defining the inline schema (`const Body = z.object({ … });`), add `import { <SharedName> } from '@popcorn/shared';` near the top, and replace the `<LocalName>.safeParse(...)` call with `<SharedName>.safeParse(...)`. If the file no longer references `z`, delete its `import { z } from 'zod';`. Worked example — `auth/login/route.ts`:
  - remove `const Body = z.object({ username: z.string().min(1), password: z.string().min(1) });`
  - remove `import { z } from 'zod';` (now unused)
  - add `import { CredentialsBody } from '@popcorn/shared';`
  - change `Body.safeParse(...)` → `CredentialsBody.safeParse(...)`

- [ ] **Step 2: Typecheck the API** — proves `@popcorn/shared` resolves for `tsc` and the schemas match the handlers' usage.

```bash
npm run typecheck -w apps/api
```
Expected: exit 0.

- [ ] **Step 3: Backend suite** — proves the shared schemas validate identically (same accept/reject behavior) and that vitest transforms the shared TS dep.

```bash
npm test
```
Expected: same profile as before (the one Ollama-gated SSE test excepted). Auth/profile/scenario validation tests still pass. If vitest cannot resolve/transform `@popcorn/shared`, fix the `server.deps.inline` from Task 1 before continuing.

- [ ] **Step 4: Commit**

```bash
git add "apps/api/src/app/api"
git commit -m "refactor(api): validate requests with @popcorn/shared schemas"
```

---

## Task 3: Type the web client's request args

**Files:** Modify `apps/web/src/api/client.ts`.

- [ ] **Step 1: Make `req` generic and type the mutating methods from the shared request types.** Apply these changes to `apps/web/src/api/client.ts`:
  - Add at the top: `import type { CredentialsBody, ProfileBody, SendMessageBody, ChooseBody } from '@popcorn/shared';`
  - Change `req`/`apiGet`/`apiPost`/`apiPut` to carry a return-type generic (used in Task 4):
    ```ts
    async function req<T = unknown>(method: string, url: string, body?: unknown): Promise<T> { /* body unchanged; `return data as T;` at the end */ }
    const apiGet = <T = unknown>(u: string) => req<T>('GET', u);
    const apiPost = <T = unknown>(u: string, b?: unknown) => req<T>('POST', u, b === undefined ? {} : b);
    const apiPut = <T = unknown>(u: string, b?: unknown) => req<T>('PUT', u, b);
    ```
  - Type the request args of the mutating methods (keep the same runtime calls):
    - `login(username: string, password: string)` and `register(...)` already typed — leave as-is (they post `CredentialsBody` shape).
    - `saveProfile(p: ProfileBody)` (was `p: unknown`).
    - `streamMessage(npcId: string, text: string, …)` — `text` already typed; the body is `SendMessageBody` shape. Leave the signature; no `unknown` to fix.
    - `streamChoose(id, choiceId, onEvent, extra?)` — already typed; leave.
    - `saveSettings(s: ...)` — there is no shared Settings request schema (the settings PUT route has no `z.object`); keep `s: unknown` for now (out of scope, documented in the spec).

- [ ] **Step 2: Typecheck the web app**

```bash
npm run typecheck -w apps/web
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/api/client.ts
git commit -m "feat(web): type client request args from @popcorn/shared"
```

---

## Task 4: Response types — declare, annotate handlers, type the client

This is the bulk. Work **endpoint by endpoint** using the rule below; commit per group (auth, npcs/threads, journey, scenarios, etc.). The contract is **today's handler output** — derive each type by reading the handler's returned value.

**The rule (apply per client method):**
1. **Read** the handler that backs the client method (table below) and note the exact shape of the value it passes to `json(...)`.
2. **Declare** a matching type in `packages/shared/src/responses.ts` (e.g. `export interface NpcListItem { … }`). Use `null`/optional exactly as the handler produces them.
3. **Annotate** the handler's output value with that type to lock it: `const out: NpcListItem[] = npcs.map(...); return json(out);` (keep `return json(out)` — do not change behavior). If a handler builds the object inline in `return json({...})`, introduce a typed `const out: <Type> = {...}` first. If annotating a particular handler is disproportionately fiddly, skip the annotation for that one and still type the client side (note it in the commit).
4. **Type the client method's return** in `apps/web/src/api/client.ts` (e.g. `npcs: (): Promise<NpcListItem[]> => apiGet<NpcListItem[]>('/api/npcs')`).
5. **Fix component fallout:** newly-typed responses may surface real mismatches in `apps/web/src/{routes/App.tsx,routes/Onboarding.tsx,routes/Scenario.tsx,components/shared.tsx}` — fix each (correct field access / add the missing optional) until `npm run typecheck -w apps/web` is clean.

**Endpoint → handler → client method table:**

| Client method | Endpoint | Handler file |
|---|---|---|
| `me()` | `GET /api/auth/me` | `auth/me/route.ts` |
| `npcs()` | `GET /api/npcs` | `npcs/route.ts` |
| `thread()` | `GET /api/threads/:npcId/messages` | `threads/[npcId]/messages/route.ts` |
| `profile()` | `GET /api/profile` | `profile/route.ts` |
| `journey()` | `GET /api/journey/summary` | `journey/summary/route.ts` |
| `relationships()` | `GET /api/journey/relationships` | `journey/relationships/route.ts` |
| `streak()` | `GET /api/journey/streak` | `journey/streak/route.ts` |
| `achievements()` | `GET /api/achievements` | `achievements/route.ts` |
| `memories()` | `GET /api/memories` | `memories/route.ts` |
| `settings()` | `GET /api/settings` | `settings/route.ts` |
| `scenarioCatalog()` | `GET /api/scenarios/catalog` | `scenarios/catalog/route.ts` |
| `sessions()` | `GET /api/scenarios/sessions` | `scenarios/sessions/route.ts` |
| `session()` | `GET /api/scenarios/sessions/:id` | `scenarios/sessions/[id]/route.ts` |
| `login()`/`register()` | `POST /api/auth/{login,register}` | `auth/login|register/route.ts` (returns `{ user }`) |
| `acceptSession()` | `POST /api/scenarios/sessions/:id/accept` | `accept/route.ts` |
| `declineSession()` | `POST /api/scenarios/sessions/:id/decline` | `decline/route.ts` |

(Methods whose response the web ignores — `logout`, `onboardingComplete`, `saveProfile`, `saveSettings`, `streamMessage`, `streamChoose` — keep their current return type; the SSE methods stay `onEvent({type,data:unknown})`.)

- [ ] **Step 1: Worked example — `npcs()`.** Read `apps/api/src/app/api/npcs/route.ts` (its `out` maps to `{ id, name, avatar: { glyph, bg, ink }, status, relationship, stageValue, lastMessage, lastTime, hasSomething }`). Add to `responses.ts`:
```ts
export interface NpcListItem {
  id: string;
  name: string;
  avatar: { glyph: string; bg: string; ink: string };
  status: string;
  relationship: string;
  stageValue: number;
  lastMessage: string | null;
  lastTime: string | Date | null;
  hasSomething: boolean;
}
```
Annotate the handler (`const out: NpcListItem[] = npcs.map(...)`), and type the client (`npcs: (): Promise<NpcListItem[]> => apiGet<NpcListItem[]>('/api/npcs')`).

- [ ] **Step 2: Repeat the rule for every remaining row in the table**, committing per group, e.g.:
```bash
git add packages/shared/src/responses.ts apps/api/src/app/api apps/web/src/api/client.ts apps/web/src
git commit -m "feat: type <group> responses end-to-end via @popcorn/shared"
```

- [ ] **Step 3: Full typecheck after each group and at the end**

```bash
npm run typecheck
```
Expected: exit 0 across `@popcorn/shared`, `apps/api`, `apps/web` once all rows + component fallout are done.

- [ ] **Step 4: Backend suite still green**

```bash
npm test
```
Expected: same profile (the annotations are type-only; no runtime change).

---

## Task 5: Final verification & branch wrap-up

- [ ] **Step 1: Typecheck everything**

```bash
npm run typecheck && (cd packages/shared && npx tsc --noEmit) && echo OK
```
Expected: exit 0 everywhere.

- [ ] **Step 2: Backend suite + runtime smoke**

```bash
npm test
```
Expected: same profile (Ollama-gated SSE test excepted). Then seed + run the smoke: clear node, `npm run db:seed:demo`, start `$env:OLLAMA_BASE_URL="http://127.0.0.1:1"; npm run dev:api` + `npm run dev:web` (background), wait for :3100 health=200 and :5173=200, then `node scripts/smoke-web.mjs all` → **SMOKE PASS**. Stop servers.

- [ ] **Step 3: Prove end-to-end enforcement (then revert)**

Temporarily rename a field in a shared schema (e.g. in `requests.ts` change `username` → `username2` in `CredentialsBody`), then:
```bash
npm run typecheck 2>&1 | grep -c "error TS" ; echo "expect: both apps report errors"
```
Expected: BOTH `apps/api` (login/register `.safeParse` usage) and `apps/web` (client `login`/`register`) fail to compile — confirming the single source. **Revert the rename** (`git checkout -- packages/shared/src/requests.ts`) and re-run `npm run typecheck` → exit 0.

- [ ] **Step 4: Branch completion**

Use **superpowers:finishing-a-development-branch** to complete `feat/shared-types-stage-c` (convention: `merge --no-ff` into `main`, then push — confirm with the user before pushing). This completes Phase 2.

---

## Notes on scope (from the spec)

- **Out of scope:** Hono `hc` RPC; handler rewrites; SSE event-payload typing; a `settings` PUT request schema (the route has no inline `z.object`); the harmless `export const dynamic` dead exports.
- **Workspace TS resolution:** `@popcorn/shared` exports `./src/index.ts`. tsx transpiles it for the running server; vitest is told to inline it (Task 1 Step 7); Vite handles the workspace dep for `apps/web` (if the optimizer balks, add a `resolve.alias` for `@popcorn/shared` → `../../packages/shared/src/index.ts` in `apps/web/vite.config.ts`). The Task 2/3/5 typecheck + smoke prove resolution on all three toolchains.
