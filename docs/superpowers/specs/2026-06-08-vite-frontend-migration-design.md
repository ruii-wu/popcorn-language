# Design — Frontend migration to Vite (Phase 1)

**Date:** 2026-06-08
**Status:** Approved for planning
**Scope:** Phase 1 of a two-phase migration. This phase replaces the frontend only.

---

## 0. Context & two-phase plan

Today the app is:

- **Backend** — Next.js 14 App Router: 34 API routes under `src/app/api/` + all business
  logic in `src/server/`, Prisma/SQLite, SSE-over-POST streaming. Working, substantial.
- **Frontend** — 4 static HTML pages in `public/app/` (`onboarding-journey`, `main-app`,
  `scenario`, `design-canvas`). Each loads React/ReactDOM/Babel from a CDN and compiles
  `.jsx` **in the browser**. ~3,550 lines of JSX across 5 files, wired together through
  globals (`window.API`, `window.WebI`, `window.WebNavRail`, …). **No build step.**

The agreed end state ("ideal, ignoring migration cost") is **Vite + React SPA front end**
and a **Hono** API backend, joined in a TS monorepo with a shared zod package for
end-to-end types. We reach it in two phases to keep each step low-risk:

- **Phase 1 (this spec): swap the frontend to Vite.** Next.js stays untouched as the
  API backend. Vite dev server proxies `/api` to Next.
- **Phase 2 (later, separate spec): swap the backend to Hono.** Introduce the monorepo +
  shared zod package at that point, where front and back live together.

This spec covers **Phase 1 only**.

## 1. Goals / Non-goals

**Goals**

- Replace the no-build CDN/Babel frontend with a real **Vite + React 18 + TypeScript** SPA.
- Faithful port: same screens, same visual design, same behavior. No redesign.
- Proper ES modules, build tooling, HMR, type checking — kill in-browser Babel and CDN React.
- Next.js backend: **zero changes** to `src/app/api/` and `src/server/`.

**Non-goals (Phase 1)**

- Hono backend (Phase 2).
- Monorepo restructure / shared zod package (Phase 2).
- Migrating `design-canvas.html` (stays legacy — see §6).
- TanStack Query / changing the data-fetching paradigm (deferred; see §5 decision A).
- Any visual redesign or new features.

## 2. Architecture

```
popcorn_language/
├─ src/app/api/   src/server/   prisma/     ← Next.js, API backend only, :3100, UNCHANGED
├─ public/app/                              ← kept; design-canvas legacy still served by Next
└─ web/                                     ← NEW: Vite + React 18 + TS single-page app
   ├─ index.html            (single entry)
   ├─ vite.config.ts        (proxy /api → http://localhost:3100)
   ├─ tailwind.config.ts  postcss.config.js  tsconfig.json  package.json
   └─ src/
      ├─ main.tsx                         app entry, mounts <Router>
      ├─ routes/        App.tsx  Onboarding.tsx  Scenario.tsx
      ├─ components/    (extracted from shared.jsx: WebI, WebNavRail, WebAvatar, …)
      ├─ api/client.ts                    (api.js ported to TS, incl. SSE-over-POST)
      └─ styles/        tokens.css  index.css (tailwind entry)
```

The browser loads **Vite (:5173)**. All `/api/*` calls are transparently proxied to
**Next (:3100)**. Because the proxy is same-origin from the browser's view, the `pop_uid`
cookie is sent automatically and SSE streams pass through unchanged.

`web/` is a **self-contained Vite app** in Phase 1 — not yet a workspace member. Types are
managed locally inside `web/`. The monorepo + shared zod package arrive in Phase 2 when the
Hono backend makes a shared package meaningful.

## 3. Module mapping — globals → ES modules (the bulk of the work)

| Today | Becomes |
|---|---|
| `window.WebI / NPCS_WEB / WebNavRail / …` (shared.jsx) | `components/*.tsx` with named `export`/`import` |
| `window.API = {…}` (api.js) | `api/client.ts`, `export const api = {…}`, logic copied verbatim |
| `const { useState } = React` (global) | `import { useState } from 'react'` |
| `<script type="text/babel">` + browser Babel | Vite compiles; CDN React/ReactDOM/Babel deleted |
| `location.assign('main-app.html')` | `useNavigate()` → `navigate('/')` |
| `<a href="scenario.html">` | `<Link to="/scenario">` |
| `Object.assign(window, {…})` at end of shared.jsx | deleted; replaced by named exports |

The three page files (`app.jsx`, `onboarding.jsx`, `scenario.jsx`) become route components
under `routes/`. JSX → TSX, adding types as we go (loose where helpful; don't block on
perfect typing).

## 4. Routing (single page + React Router)

| Old page | New route | Notes |
|---|---|---|
| `main-app.html` | `/` | main chat |
| `onboarding-journey.html` | `/onboarding` | onboarding + journey dashboard (one page, two states — as today) |
| `scenario.html` | `/scenario` | **no `:id`** — `scenario.jsx` loads all sessions via `API.sessions()` and picks active→invited→completed itself |
| `design-canvas.html` | — | not migrated; reachable via Next at `/app/design-canvas.html` |

401 fallback: `navigate('/onboarding')` (mirrors today's `location.assign('onboarding-journey.html')`).

## 5. Data layer — Decision A (faithful port)

`api.js` → `api/client.ts`: the `req` / `apiGet/Post/Put` / `streamPost` logic is copied
**verbatim**, only adding TS types. The manual SSE-over-POST stream reader is the app's
lifeline and is **not touched**.

Data fetching keeps the **current paradigm**: `useEffect` + `api.x().then(setState)`, ported
1:1. Phase 1 changes *structure* (globals→modules, JSX→TSX, multi-page→router) but **not**
the fetch paradigm — this makes behavior easiest to verify against the old app.

TanStack Query is explicitly **deferred** (optional enhancement after Phase 1 is working).

## 6. Styling

- CDN Tailwind → proper **Tailwind v3 build** (PostCSS). Port the inline Tailwind config and
  fonts (`Outfit`, serif, etc.) into `tailwind.config.ts` / CSS. Arbitrary values used heavily
  in the code (`text-[12.5px]`, `oklch(...)`) are natively supported by JIT.
- `styles/tokens.css` (CSS custom properties like `var(--coral)`) — kept **as-is**, imported
  at the entry.
- Inline `style={{ … var(--coral) … }}` — unaffected.

## 7. Dev / build / run

- **Dev:** root scripts `dev:api` (`next dev -p 3100`), `dev:web` (`vite`), and `dev`
  (both together via `concurrently`). One `npm run dev` brings up both with no friction.
- `vite.config.ts` proxies `/api` → `http://localhost:3100`, with buffering disabled so SSE
  streams flow through.
- **Build:** `vite build` → `web/dist`. For the local demo, running the two dev servers is
  sufficient (the project is local-demo-only). Having Next serve `dist` in "production" is a
  later concern, out of scope here.
- Ports: Next 3100 / Vite 5173 — both avoid the OS-blocked 3000.

## 8. Ripple effects (in scope for this phase)

Switching to Vite changes the URLs, so references to the old `:3100/app/*.html` are updated:

- `scripts/smoke-web.mjs` — page URLs it probes.
- `docs/uat-sop.md` — access URLs in the UAT steps.
- `README.md` — run instructions.

## 9. Verification

Faithful-port parity check, screen by screen, against the running Next API:

- App boots on Vite; no CDN React/Babel remain; `npm run build` (Vite) succeeds; `tsc` clean.
- `/` chat: thread list loads, sending a message streams tokens (SSE) into the bubble.
- `/onboarding`: onboarding flow + journey dashboard render and load journey data.
- `/scenario`: session is picked (active/invited/completed) and renders the right state.
- 401 anywhere redirects to `/onboarding`.
- Next backend + its vitest suite untouched and still green.

## 10. Out of scope (Phase 1)

Hono backend, monorepo / shared zod package, `design-canvas.html` migration, TanStack Query,
any visual redesign or new features. All deferred to Phase 2 or beyond.
