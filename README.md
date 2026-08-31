# Popcorn Language

NUS Master of Computing capstone — a **local-LLM-powered, bilingual (中→EN) language-learning platform** with persistent AI NPCs, structured memory, an evidence-based Learner Model, and adaptive scenario practice. Built on Hono + Vite/React + TypeScript + Prisma/SQLite + Ollama. See [`docs/context.md`](docs/context.md) for background.

> **Submission candidate.** The assessed product flow is feature-complete and frozen for reproducibility and final-report alignment. Chat, memory retrieval, grammar correction, reversible recall, relationship progression, scenario gameplay, learning-signal aggregation, adaptive recommendations, Journey, Settings, evaluation harnesses, and reset/seed flows are implemented and covered by automated tests.

---

## Prerequisites

- **Node.js 24.19.0 LTS** (`node -v`). The repo is pinned with `.nvmrc`, `.npmrc`, and
  `engines.node` so everyone runs the same toolchain. With `nvm`:
  ```bash
  nvm install
  nvm use
  ```
- **Ollama** — *optional* for development. The app boots and all tests pass without it. For live AI:
  ```bash
  ollama pull qwen3.5:9b
  ollama pull nomic-embed-text
  ```
  (If your Ollama lacks the `qwen3.5:9b` tag, pull the nearest Qwen chat model and set
  `OLLAMA_CHAT_MODEL` in `.env`. A 9B model on CPU streams replies but is slow — the UI
  shows tokens as they generate and never blocks.)

## Setup

```bash
nvm use                            # switches to the exact version in .nvmrc
npm install
cp apps/api/.env.example apps/api/.env
npm run db:migrate                 # creates the SQLite schema (prisma/dev.db)
npm run db:seed                    # base seed: 3 NPCs, 2 scenarios, 6 achievements
npm run db:seed:demo               # optional: a rich `demo`/`demo` user for demos
```

PowerShell equivalent for the env file:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

## Run in development

```bash
npm run dev                        # API on :3100, Vite UI on :5173
```
Then open the web client at **`http://localhost:5173/`** (the Vite SPA proxies `/api/*` to the
Hono backend on :3100, so the session cookie and API calls just work).

The Vite proxy exists only in development. The submission/demo command builds the SPA and lets
Hono serve both the web assets and `/api/*` from one origin:

```bash
npm run demo                       # one process and one port: http://localhost:3100
```

Health check:
```
GET http://localhost:3100/api/system/health
→ { "server":"up", "uptimeMs":6, "ollama": { "reachable":false, "model":"qwen3.5:9b", "modelInstalled":false, "latencyMs":6 } }
```
`"reachable": false` is expected when Ollama isn't running — it does not block development.

## Verification

```bash
npm run verify        # offline release gate: fresh DB, migrations/seeds, types, tests, build
npm run verify:eval   # research evaluation: ablation + LongMemEval-S retrieval benchmark
```

`verify` is deterministic and does not call a live model. It rebuilds a temporary database from all
migrations, runs both seeds at a fixed time anchor, typechecks both apps, runs all API and Web tests,
and creates the production web bundle. `verify:eval` is intentionally separate because LongMemEval
downloads the public dataset into ignored `.cache/eval/` and uses the configured Ollama embedding
model. Evaluation outputs are written under `docs/reports/data/`.

## Demo

```bash
nvm use
npm run db:seed && npm run db:seed:demo
npm run demo
```

Before a live demo, keep the app running in one terminal and verify the full environment in another:

```bash
nvm use
DEMO_WEB_URL=http://localhost:3100 DEMO_API_URL=http://localhost:3100 npm run demo:check
```

The check fails fast when the pinned Node version, Hono app, SQLite migrations, Ollama, or either
required model is unavailable. It also warns when the chat model is installed but still cold.
Open `http://localhost:3100/` and log in as **`demo` / `demo`** (the
onboarding page at `http://localhost:3100/onboarding` has the login form; new accounts are created
by running its wizard) — a learner pre-populated with three relationships (Lily = close, Chen =
friend, Emma = friend), memory facts + a memory card, one completed graded scenario,
unlocked achievements, three Learning Focus areas, and a multi-day streak. `db:seed:demo` is
additive and idempotent. Set `DEMO_SEED_NOW=<ISO timestamp>` to reproduce its relative dates exactly.

For a reliable course demo, check these before presenting:

```bash
node -v                            # must print v24.19.0
npm run verify
curl http://localhost:3100/api/system/health
```

If Ollama is not running, the health response will show `"reachable": false`; the app still opens,
but live chat/scenario generation needs Ollama running with the configured chat model installed.

A headless end-to-end smoke of the wired UI lives at `npm run smoke:web`
(`node scripts/smoke-web.mjs <api|chat|journey|scenario|all>`). Set
`DEMO_WEB_URL=http://localhost:3100` when checking the single-port build.

## API surface (36 routes)

All business routes require the `pop_uid` session cookie (via `withUser`) and are scoped by `userId`. Errors use a uniform `{ error: { code, message } }` envelope.

| Group | Routes |
|---|---|
| **Auth** | `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` |
| **Profile / Onboarding** | `GET·PUT /api/profile` · `POST /api/onboarding/complete` |
| **NPCs** | `GET /api/npcs` · `GET /api/npcs/:id` |
| **Threads / Messages** | `GET·POST /api/threads/:npcId/messages` (POST = **SSE**) · `DELETE /api/threads/:npcId` · `DELETE /api/threads/:npcId/messages/:msgId` · `POST /api/threads/:npcId/messages/:msgId/restore` · `POST /api/threads/:npcId/messages/:msgId/correction` |
| **Scenarios** | `GET /api/scenarios/catalog` · `GET /api/scenarios/sessions` · `GET /api/scenarios/sessions/:id` · `POST …/{accept,decline,pause,resume,abort}` · `POST …/{choose,freetype}` (**SSE**) |
| **Memories** | `GET /api/memories` · `GET /api/memories/recent` · `DELETE /api/memories/:id` |
| **Journey** | `GET /api/journey/{summary,relationships,streak}` |
| **Achievements** | `GET /api/achievements` · `POST /api/achievements/generate` (dynamic, LLM) |
| **Settings / System** | `GET·PUT /api/settings` · `GET /api/system/health` · `GET /api/system/models` · `POST /api/system/reset` |
| **Dev (research)** | `POST /api/dev/memory-eval` (404 in production) |

### SSE events

`POST /api/threads/:npcId/messages` and the scenario `choose`/`freetype` routes stream:
`user_message_saved · typing_start/end · token · message_complete · correction · suggestions_update · scenario_offer · state_update · choices · scenario_end · error · done`.

### Scenario trigger and recall behavior

The casual chat stream runs the deterministic scenario trigger before ordinary NPC generation.
When the relationship stage, visible user-turn count, and topic keyword all match, the API
creates an invited session and emits `scenario_offer` without first saving an ordinary NPC reply.
If the user declines, the same triggering user turn continues through the normal chat stream.
Declined scenarios may be offered again after a later direct topic mention; an old keyword in the
recent-message window alone does not re-trigger an offer.

Message recall is a reversible rollback. `DELETE .../:msgId` marks the ordinary user message as
retracted, hides every later message and still-open scenario session, and keeps the original data
in SQLite. `POST .../:msgId/restore` clears the rollback and restores the hidden thread history
and scenario session. The UI shows `Message retracted`, offers `Edit` to refill the composer, and
offers `Undo recall` to restore the later content.

Scenario completion persists the final turn before generating the review. The completion claim,
learning signals, mastery snapshots, summary, and progression then commit atomically. If that tail
fails, the UI replaces the composer with `Retry review`; the server refuses extra roleplay turns and
reuses an already-persisted summary when compensating optional Memory generation.
Template turn counts are pacing targets rather than forced endings: the roleplay completes after an
in-character closing with no new question, with a three-turn safety margin to prevent an endless session.

`npm run db:migrate` runs a SQLite preflight that creates a missing database file before Prisma starts.
This keeps a fresh clone from hitting Prisma 5's empty `Schema engine error` on first migration.

## Environment variables (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite database location |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Local Ollama HTTP API |
| `OLLAMA_CHAT_MODEL` | `qwen3.5:9b` | Chat / JSON generation model |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model (semantic memory recall) |
| `PORT` | `3100` | Hono listen port |
| `APP_STATIC_DIR` | unset | Built SPA directory; injected automatically by `npm run demo` |

## Project structure

```
apps/api/src/app/api/.../route.ts # Web-standard route handlers mounted by Hono
apps/api/src/server/
  auth/                     # minimal session cookie (pop_uid) + requireUser / withUser
  llm/ollama.ts             # Ollama client: health / chat (stream) / chatJson (+Zod retry) / embed
  prompt/                   # PromptBuilder (persona + memory + bilingual + scenario modes)
  memory/                   # MemoryStrategy (recency/summary/semantic/hybrid) + eval harness
  scenario/                 # orchestrator: trigger judge / accept / per-turn loop / end flow
  relationship/ correction/ achievements/   # Modules 5 / 6 / 7 (+ dynamic achievements)
  http/respond.ts           # json / errorJson / withUser
  db/client.ts              # Prisma client singleton
apps/api/prisma/
  schema.prisma             # 19-model schema
  seed.ts / seed-data.ts    # base seed (3 NPCs, 2 scenarios, 6 achievements)
  seedDemo.ts / seed-demo.ts # rich demo user (npm run db:seed:demo)
apps/api/tests/ unit/ integration/   # pure-logic + SQLite-backed tests (mocked Ollama)
scripts/smoke-web.mjs       # headless Edge end-to-end smoke of the wired UI
docs/                       # background, specs, plans, and reports (figures)
apps/web/                   # Vite + React + TypeScript SPA; proxies /api/* to Hono on :3100
public/app/                 # legacy static prototype/dev-tool reference
```

## Roadmap, design & report docs

- **Design spec (v2):** [`docs/superpowers/specs/2026-05-25-backend-roadmap-design.md`](docs/superpowers/specs/2026-05-25-backend-roadmap-design.md)
- **Master plan (W1–W9):** [`docs/superpowers/plans/2026-05-25-backend-overall-plan.md`](docs/superpowers/plans/2026-05-25-backend-overall-plan.md)
- **Per-phase plans:** `docs/superpowers/plans/2026-05-*-backend-w{1..9}-*.md`
- **Report figures:** [`docs/reports/memory-ablation.md`](docs/reports/memory-ablation.md) · [`docs/reports/data/longmemeval-s-retrieval.md`](docs/reports/data/longmemeval-s-retrieval.md) · [`docs/reports/architecture.md`](docs/reports/architecture.md)
- **UAT SOP:** [`docs/uat-sop.md`](docs/uat-sop.md) — manual user-acceptance-test procedure for the web client (17 test cases keyed to the demo seed)

## Web client

The frontend is a **Vite + React + TypeScript SPA** (`apps/web/`) that proxies `/api/*` to the
Hono backend on :3100, so the `pop_uid` cookie and API calls work with no CORS configuration
needed. `npm run dev` starts both the API server and the Vite dev server together. For the
single-port production-style build, use the equivalent routes on `http://localhost:3100`.

- **Main app (chat):** `http://localhost:5173/`
- **Onboarding / Journey:** `http://localhost:5173/onboarding`
- **Scenario:** `http://localhost:5173/scenario`

Use the in-app navigation and direct routes above to move between screens. The old bottom-right
web-demo dock is no longer part of the product UI. `public/app/` retains legacy prototype files as
a design reference, but the product runtime is the Vite SPA.

## Submission deployment scope

The account layer is scoped to a single-machine course assessment: it provides deterministic
multi-user data separation and an httpOnly session cookie without introducing an external identity
provider. Internet deployment is outside the assessed product scope; a public deployment would
replace this layer with password hashing, CSRF protection, secure cookie policy, rate limiting, and
a production identity/session service. The capstone contribution is the conversational learning,
memory, Learner Model, and adaptive practice architecture.
