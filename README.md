# Popcorn Language

NUS Master of Computing capstone — a **local-LLM-powered, bilingual (中→EN) language-learning platform** with persistent AI NPCs and embedded scenario gameplay. Built on Next.js 14 + TypeScript + Prisma/SQLite + Ollama. See [`docs/context.md`](docs/context.md) for project background.

> **Project status:** **W1 (foundation) complete.** The app boots, the database is schema'd and seeded, the Ollama client + PromptBuilder + minimal session-auth + a health endpoint are in place. Chat streaming, the memory engine, scenarios, relationships, achievements, and the Journey dashboard are upcoming phases — see [the roadmap](#roadmap--design-docs).

---

## Prerequisites

- **Node.js 20+** (`node -v`). Tested on Node 24.
- **Ollama** — *optional* for development. The app boots and all tests pass without it. To enable live AI responses, install [Ollama](https://ollama.com) and pull the models:
  ```
  ollama pull qwen2.5:7b-instruct
  ollama pull nomic-embed-text
  ```

## Setup

```powershell
npm install
Copy-Item .env.example .env        # macOS/Linux: cp .env.example .env
npm run db:migrate                 # creates the SQLite schema (prisma/dev.db)
npm run db:seed                    # seeds 3 NPCs, 1 scenario, 6 achievements
```

## Run

```powershell
npm run dev                        # http://localhost:3000
```

Health check — confirms the server is up and reports Ollama status:

```
GET http://localhost:3000/api/system/health
→ { "server": "up", "uptimeMs": 6,
    "ollama": { "reachable": false, "model": "qwen2.5:7b-instruct", "modelInstalled": false, "latencyMs": 6 } }
```

`"reachable": false` is expected when Ollama isn't running — it does not block development.

## Test & typecheck

```powershell
npm run test          # vitest: unit (no DB/Ollama) + integration (SQLite, mocked Ollama)
npm run typecheck     # tsc --noEmit
```

Unit tests mock Ollama and need no database; integration tests use the migrated SQLite file. No test calls a live model.

## Environment variables (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite database location |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Local Ollama HTTP API |
| `OLLAMA_CHAT_MODEL` | `qwen2.5:7b-instruct` | Chat / JSON generation model |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model (semantic memory recall) |

## Project structure

```
app/api/.../route.ts        # Next.js App Router handlers (REST + SSE)
  system/health/route.ts    #   GET /api/system/health
src/server/
  auth/                     # minimal session cookie + requireUser()
  llm/ollama.ts             # Ollama client: health / chat (stream) / chatJson (+Zod retry) / embed
  prompt/                   # PromptBuilder (persona + memory + bilingual + scenario modes)
  db/client.ts              # Prisma client singleton
prisma/
  schema.prisma             # 17-model schema (users, NPCs, threads, scenarios, memory, achievements)
  migrations/               # versioned SQL migrations
  seed.ts / seed-data.ts    # 3 NPCs, mock_interview scenario, 6 achievements
tests/
  unit/                     # pure-logic tests (no DB/Ollama)
  integration/              # SQLite-backed tests
docs/                       # background, design specs, and implementation plans
prototypes/web/             # static HTML/JSX UI prototype (no build step)
```

## Roadmap & design docs

- **Design spec (v2):** [`docs/superpowers/specs/2026-05-25-backend-roadmap-design.md`](docs/superpowers/specs/2026-05-25-backend-roadmap-design.md)
- **Master plan (W1–W9):** [`docs/superpowers/plans/2026-05-25-backend-overall-plan.md`](docs/superpowers/plans/2026-05-25-backend-overall-plan.md)
- **W1 detailed plan:** [`docs/superpowers/plans/2026-05-25-backend-w1-foundation.md`](docs/superpowers/plans/2026-05-25-backend-w1-foundation.md)

## Web prototype (static demo)

The original UI prototype is a no-build static demo, independent of the Next.js app:

```powershell
./scripts/start.ps1                # serves prototypes/web/ at http://localhost:8080
```

Requires Python 3 in PATH. The three demo screens (main app · scenario · onboarding/journey) cross-link via the bottom-right dock.

## A note on auth

Authentication is **intentionally minimal** for this local capstone demo: plaintext password compared by a single DB query, with the session stored in an httpOnly cookie. This is **not secure and must never be deployed beyond localhost.** Auth is not a contribution of this project; the engineering focus is local-LLM engagement and memory architecture.
