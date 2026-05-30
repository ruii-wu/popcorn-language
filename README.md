# Popcorn Language

NUS Master of Computing capstone — a **local-LLM-powered, bilingual (中→EN) language-learning platform** with persistent AI NPCs and embedded scenario gameplay. Built on Next.js 14 + TypeScript + Prisma/SQLite + Ollama. See [`docs/context.md`](docs/context.md) for background.

> ⚠️ **Local demo only.** Authentication is intentionally minimal (see [A note on auth](#a-note-on-auth)). **Never deploy this beyond localhost.**

> **Project status: backend complete (W1–W8) + web client wired (W10).** Chat (SSE streaming), the pluggable memory engine + ablation harness, scenario gameplay, grammar correction, relationships/progression, achievements (static + dynamic), the Journey dashboard, Settings, and system/reset are all implemented and tested. 225 Vitest cases pass; `typecheck` is clean. The React UI now talks to the live API and is **served same-origin from the backend at `/app`** (`public/app/`) — open `http://localhost:3100/app/main-app.html` to use the product end-to-end. The chat model is `qwen3.5:9b`.

---

## Prerequisites

- **Node.js 20+** (`node -v`). Tested on Node 24.
- **Ollama** — *optional* for development. The app boots and all tests pass without it. For live AI:
  ```
  ollama pull qwen3.5:9b
  ollama pull nomic-embed-text
  ```
  (If your Ollama lacks the `qwen3.5:9b` tag, pull the nearest Qwen chat model and set
  `OLLAMA_CHAT_MODEL` in `.env`. A 9B model on CPU streams replies but is slow — the UI
  shows tokens as they generate and never blocks.)

## Setup

```powershell
npm install
Copy-Item .env.example .env        # macOS/Linux: cp .env.example .env
npm run db:migrate                 # creates the SQLite schema (prisma/dev.db)
npm run db:seed                    # base seed: 3 NPCs, 2 scenarios, 6 achievements
npm run db:seed:demo               # optional: a rich `demo`/`demo` user for demos
```

## Run

```powershell
npm run dev                        # http://localhost:3100
```
Then open the web client at **`http://localhost:3100/app/main-app.html`** (served same-origin
with the API, so the session cookie and `/api/*` calls just work).

Health check:
```
GET http://localhost:3100/api/system/health
→ { "server":"up", "uptimeMs":6, "ollama": { "reachable":false, "model":"qwen3.5:9b", "modelInstalled":false, "latencyMs":6 } }
```
`"reachable": false` is expected when Ollama isn't running — it does not block development.

## Test & typecheck

```powershell
npm run test          # vitest: unit (no DB/Ollama) + integration (SQLite, mocked Ollama)
npm run typecheck     # tsc --noEmit
npm run report:ablation   # regenerate docs/reports/memory-ablation.md (deterministic)
```

No test calls a live model.

## Demo

```powershell
npm run db:seed && npm run db:seed:demo
npm run dev
```
Open `http://localhost:3100/app/main-app.html` and log in as **`demo` / `demo`** (the
onboarding page at `/app/onboarding-journey.html` has the login form; new accounts are created
by running its wizard) — a learner pre-populated with three relationships (Lily = close, Chen =
friend, Emma = acquaintance), memory facts + a memory card, one completed graded scenario,
unlocked achievements, and a multi-day streak. `db:seed:demo` is additive and idempotent.

A headless end-to-end smoke of the wired UI (drives the installed Edge against a running dev
server) lives at `npm run smoke:web` (`node scripts/smoke-web.mjs <api|chat|journey|scenario|all>`).

## API surface (34 routes)

All business routes require the `pop_uid` session cookie (via `withUser`) and are scoped by `userId`. Errors use a uniform `{ error: { code, message } }` envelope.

| Group | Routes |
|---|---|
| **Auth** | `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` |
| **Profile / Onboarding** | `GET·PUT /api/profile` · `POST /api/onboarding/complete` |
| **NPCs** | `GET /api/npcs` · `GET /api/npcs/:id` |
| **Threads / Messages** | `GET·POST /api/threads/:npcId/messages` (POST = **SSE**) · `DELETE /api/threads/:npcId` · `POST /api/threads/:npcId/messages/:msgId/correction` |
| **Scenarios** | `GET /api/scenarios/catalog` · `GET /api/scenarios/sessions` · `GET /api/scenarios/sessions/:id` · `POST …/{accept,decline,pause,resume,abort}` · `POST …/{choose,freetype}` (**SSE**) |
| **Memories** | `GET /api/memories` · `GET /api/memories/recent` · `DELETE /api/memories/:id` |
| **Journey** | `GET /api/journey/{summary,relationships,streak}` |
| **Achievements** | `GET /api/achievements` · `POST /api/achievements/generate` (dynamic, LLM) |
| **Settings / System** | `GET·PUT /api/settings` · `GET /api/system/health` · `GET /api/system/models` · `POST /api/system/reset` |
| **Dev (research)** | `POST /api/dev/memory-eval` (404 in production) |

### SSE events

`POST /api/threads/:npcId/messages` and the scenario `choose`/`freetype` routes stream:
`user_message_saved · typing_start/end · token · message_complete · correction · suggestions_update · scenario_offer · state_update · choices · scenario_end · error · done`.

## Environment variables (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite database location |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Local Ollama HTTP API |
| `OLLAMA_CHAT_MODEL` | `qwen3.5:9b` | Chat / JSON generation model |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model (semantic memory recall) |

## Project structure

```
src/app/api/.../route.ts    # Next.js App Router handlers (REST + SSE), 34 routes
src/server/
  auth/                     # minimal session cookie (pop_uid) + requireUser / withUser
  llm/ollama.ts             # Ollama client: health / chat (stream) / chatJson (+Zod retry) / embed
  prompt/                   # PromptBuilder (persona + memory + bilingual + scenario modes)
  memory/                   # MemoryStrategy (recency/summary/semantic/hybrid) + eval harness
  scenario/                 # orchestrator: trigger judge / accept / per-turn loop / end flow
  relationship/ correction/ achievements/   # Modules 5 / 6 / 7 (+ dynamic achievements)
  http/respond.ts           # json / errorJson / withUser
  db/client.ts              # Prisma client singleton
prisma/
  schema.prisma             # 19-model schema
  seed.ts / seed-data.ts    # base seed (3 NPCs, 2 scenarios, 6 achievements)
  seedDemo.ts / seed-demo.ts # rich demo user (npm run db:seed:demo)
tests/ unit/ integration/   # pure-logic + SQLite-backed tests (mocked Ollama)
scripts/smoke-web.mjs       # headless Edge end-to-end smoke of the wired UI
docs/                       # background, specs, plans, and reports (figures)
public/app/                 # the web client (CDN React + in-browser Babel, no build),
                            #   served same-origin by Next at /app; src/api.js → /api/*
```

## Roadmap, design & report docs

- **Design spec (v2):** [`docs/superpowers/specs/2026-05-25-backend-roadmap-design.md`](docs/superpowers/specs/2026-05-25-backend-roadmap-design.md)
- **Master plan (W1–W9):** [`docs/superpowers/plans/2026-05-25-backend-overall-plan.md`](docs/superpowers/plans/2026-05-25-backend-overall-plan.md)
- **Per-phase plans:** `docs/superpowers/plans/2026-05-*-backend-w{1..9}-*.md`
- **Report figures:** [`docs/reports/memory-ablation.md`](docs/reports/memory-ablation.md) · [`docs/reports/architecture.md`](docs/reports/architecture.md)

## Web client

The React UI lives in `public/app/` (CDN React + in-browser Babel — **no build step**) and is
served **same-origin** by the Next backend, so the `pop_uid` cookie and `/api/*` calls work with
no CORS. With `npm run dev` running, open:

- **Main app (chat):** `http://localhost:3100/app/main-app.html`
- **Onboarding / Journey:** `http://localhost:3100/app/onboarding-journey.html`
- **Scenario:** `http://localhost:3100/app/scenario.html`

The three screens cross-link via the bottom-right dock. `src/api.js` is the thin client
(`window.API`) that wraps `/api/*` including an SSE-over-POST reader for streaming chat/scenario
turns.

## A note on auth

Authentication is **intentionally minimal** for this local capstone demo: a plaintext password compared by a single DB query, with the user id stored in an httpOnly cookie (`pop_uid`). There is no bcrypt, Auth.js, or CSRF protection. This is **not secure and must never be deployed beyond localhost.** Auth is not a contribution of this project; the engineering focus is local-LLM engagement and memory architecture.
