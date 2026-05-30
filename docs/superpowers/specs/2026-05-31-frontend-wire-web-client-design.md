# Design — Wire the web client to the live backend (+ chat-model swap)

> Status: approved (Approach A). Date: 2026-05-31. Branch: `frontend/wire-web-client`.
> Goal: make the product **usable end-to-end on localhost** by connecting the existing
> React UI to the real API, and switch the chat model to `qwen3.5:9b`.

## Context

The backend is API-only and complete (W1–W9, 34 routes on `:3100`). The UI in
`prototypes/web/` is a finished React app (CDN React 18 UMD + in-browser Babel, no build
step) covering three product surfaces — **chat** (`src/app.jsx`), **onboarding/journey**
(`src/onboarding.jsx`), **scenario** (`src/scenario.jsx`) — plus a `design-canvas.html`
design-system showcase. Today every surface reads **hardcoded mock constants**
(`NPCS_WEB`, `LILY_THREAD_WEB`, `THREAD_A_WEB`, `ROLES/GOALS/INTERESTS`, …) and never
calls the API. Shared components/data are exposed as page-global identifiers from
`src/shared.jsx` (e.g. `WebI`, `NPCS_WEB`, `WebAvatar`, `RELATIONSHIP_LABEL`).

This phase makes all three surfaces talk to the real backend so the product can be
experienced (clicked through) on localhost, and swaps the chat model.

## Approach (A — chosen)

**Serve the existing React UI same-origin from the backend, add a thin client API layer,
and replace the mock constants with `fetch` + SSE calls. Zero build step.**

Rejected alternatives: **B** port the JSX into real Next.js pages (a large rewrite of
three files, a build pipeline — buys nothing for a localhost demo); **C** separate static
server + CORS with cross-origin cookies (fragile, security smell, no benefit). Same-origin
serving is what makes the `pop_uid` cookie and `/api/*` calls work with no CORS and no auth
changes.

## Architecture

### 1. Serving — same origin

`git mv prototypes/web → public/app/`. Next.js serves `public/` statically, so the UI is
reachable at `http://localhost:3100/app/main-app.html`, `…/onboarding-journey.html`,
`…/scenario.html` — same origin as `/api/*`. The `.jsx` files are still fetched as static
assets and transpiled in-browser by Babel (unchanged). The files graduate from "prototype"
to "the web client": one source of truth, no copy/drift. `design-canvas.html` moves along as
a design reference but is **not** wired.

Internal references stay relative (`styles/tokens.css`, `src/shared.jsx`, `src/app.jsx`), so
they resolve under `/app/` unchanged. A convenience redirect `GET /` → `/app/main-app.html`
is **out of scope** for now (the root staying 404 is fine); we navigate by full URL.

### 2. Client API layer — `public/app/src/api.js`

New file, loaded via `<script src="src/api.js">` before each page's component script. It
exposes one page-global `API` object. Same-origin → the browser sends the `pop_uid` cookie
automatically (default `credentials: 'same-origin'`).

Surface:

- **Auth/session:** `API.me()`, `API.login(username,password)`, `API.register(...)`,
  `API.logout()`.
- **Chat:** `API.npcs()`, `API.thread(npcId)`,
  `API.streamMessage(npcId, text, onEvent)`.
- **Journey:** `API.journey()`, `API.relationships()`, `API.streak()`,
  `API.achievements()`.
- **Scenario:** `API.scenarioCatalog()`, `API.createSession(templateId)`,
  `API.acceptSession(id)`, `API.streamChoose(id, choiceId, onEvent)`,
  `API.declineSession(id, reason?)`.

**SSE over POST:** the message and scenario-choose routes stream `event:`/`data:` over a
**POST** body, so `EventSource` (GET-only) cannot be used. `api.js` includes a small
`streamPost(url, body, onEvent)` helper: `fetch(POST)` → `res.body.getReader()` → decode
chunks → split on `\n\n` → parse `event:`/`data:` → `onEvent({type, data})`. JSON helpers
`apiGet/apiPost` throw on non-2xx with the backend's `{error}` shape so callers can show it.

### 3. Per-surface wiring (replace mock constants)

- **Chat (`app.jsx`)** — NPC list ← `API.npcs()`; open thread ← `API.thread(activeId)`;
  send box → `API.streamMessage`, consuming the event sequence
  `user_message_saved → typing_start → token… → message_complete → correction →
  scenario_offer? → done`. The relationship dots / "hasSomething" reflect live data; a
  `scenario_offer` surfaces an invite that deep-links to `scenario.html`.
- **Onboarding/journey (`onboarding.jsx`)** — the wizard already collects role / goal /
  interests (its `ProfileStep`), which map 1:1 onto `PUT /api/profile`
  (`{role, goal, interests[], language}`). We add **one username field** to that step
  (password = username, matching the demo convention). On finish the sequence is:
  `API.register({username, password:username})` → on 409 fall back to `API.login` →
  `PUT /api/profile` with the collected answers → `POST /api/onboarding/complete` (seeds the
  Lily thread + intro) → redirect to `main-app.html`. The journey/progress view reads real
  `API.journey()/relationships()/streak()/achievements()` instead of the
  `RELATIONSHIPS`/`SCENARIOS` constants. (Multi-select goals collapse to the backend's single
  `goal`; interests pass through as the array.)
- **Scenario (`scenario.jsx`)** — `API.scenarioCatalog()` → `API.createSession` →
  `API.acceptSession` (opening turn) → `API.streamChoose` per turn (SSE
  `token → state_update → choices`) → `scenario_end` renders the summary card. The HUD
  meters/stress bind to `state_update` payloads. `THREAD_*`/`CHOICES`/`LINDA_MESSAGES`
  mock constants are removed.

### 4. Auth gate & navigation

On load each page calls `API.me()`. A **401 → redirect to `onboarding-journey.html`**, which
doubles as the auth entry: a **new** user runs the wizard (ends in `register`, see above), and
a **returning** user logs in via a compact username/password affordance on the same page (no
need to re-run the wizard). After successful auth → `main-app.html`. The three pages navigate
via plain `<a href>`/`location.assign`. No SPA router — keeping the existing multi-page
layout.

### 5. Error / empty / loading states

Ollama-down is the common local case. The chat/scenario SSE already emits a clean
`error: { code: 'LLM_UNAVAILABLE' }` followed by `done`; the UI renders that inline as a
failed/greyed bubble and **re-enables the composer** — it must never hang on a spinner.
`fetch` failures surface the backend `{error.message}` in a toast/inline note. Loading
skeletons show while data is in flight; empty states cover a brand-new user (no threads,
no memories, day-0 streak).

## Chat-model swap (independent of the wiring)

Switch the **chat** model `qwen2.5:7b-instruct → qwen3.5:9b`. The **embedding** model
`nomic-embed-text` is unchanged ("对话模型" = chat only). Touch points found:

- `.env` → `OLLAMA_CHAT_MODEL="qwen3.5:9b"`.
- `src/server/llm/ollama.ts` → fallback default.
- `src/server/settings/settings.ts` → `DEFAULTS.modelName`.
- `prisma/schema.prisma` → `modelName @default(...)` + a new Prisma migration so a fresh DB,
  `/api/system/health`, and the settings screen all show the new model; then re-seed demo.
- Applied migration SQL under `prisma/migrations/2026052…_init/` is a historical record and
  is **not** edited; the new default ships as a fresh migration.

The plan will confirm whether the live chat call reads `process.env.OLLAMA_CHAT_MODEL` (env)
vs. the per-user `settings.modelName`, and update whichever path is authoritative so the
model is genuinely switched (not just the displayed value).

⚠️ **Open risk:** the exact Ollama tag `qwen3.5:9b` is unverified from this environment. If
`ollama pull qwen3.5:9b` errors, the correct tag (e.g. `qwen3:8b`) is a one-line `.env`/code
fix — the wiring is unaffected.

## Testing & verification

- Backend API **contracts do not change** → the existing 223 tests must stay green
  (`npm test`) and `npm run typecheck` exit 0.
- New wiring is browser-side. A **headless chromium smoke** is the done-when proof: serve
  the app, log in as the seeded `demo`/`demo` user, assert the NPC list and journey render
  from the **API** (values that only exist in the DB, e.g. Lily = close/stage 3 — not the
  mock `NPCS_WEB`), and that sending a message reaches the SSE endpoint and degrades
  gracefully with Ollama down (failed bubble, composer re-enabled).
- A manual real-Ollama walkthrough once the model is pulled (chat reply streams, grammar
  correction appears, a scenario can be played to a summary).

## Out of scope / scope guards

- **Auth is intentionally minimal and stays that way** — plaintext password, single-query
  login, `pop_uid=userId` cookie, no bcrypt/Auth.js/CSRF. It is **local-demo-only**, is
  **not** a project contribution, and must **not** be raised as a security finding. The web
  login/register simply exercises this existing minimal auth. The demo seed deliberately
  sets `password = username`.
- The **CDN-React + in-browser-Babel, no-build** setup is an intentional zero-build choice
  for a localhost demo — not a finding. A production build (bundling, pinned deps) is a
  possible future step, not this phase.
- No new product features, no API/route changes, no redesign of the UI — this phase only
  connects the finished UI to the finished backend and swaps the chat model.
- `dev.db*` are gitignored; `.claude/settings.local.json` stays dirty/uncommitted.

## Risks

1. `qwen3.5:9b` tag may not exist (see above) — trivial fix, isolated.
2. Mock-vs-API data-shape drift per surface (e.g. avatar/relationship fields) — handled per
   surface during wiring by mapping API responses to what each component expects.
3. In-browser Babel recompiles JSX on every load (slow first paint) — acceptable for a
   localhost demo; noted, not fixed.
