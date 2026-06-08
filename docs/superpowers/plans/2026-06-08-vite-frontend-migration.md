# Vite Frontend Migration (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faithfully port the `public/app` no-build CDN/Babel frontend into a new `web/` Vite + React 18 + TypeScript single-page app, while the Next.js backend stays untouched and is reached via a dev proxy.

**Architecture:** A self-contained Vite SPA in `web/` renders three routes (`/`, `/onboarding`, `/scenario`) using React Router. The browser loads Vite on `:5173`; all `/api/*` calls are proxied to the existing Next.js API on `:3100`, so the `pop_uid` cookie and SSE-over-POST streaming work same-origin. Source files are mechanically ported: window globals → ES modules, `React` global → imports, `<script type="text/babel">` → Vite compilation, full-page `location.assign('*.html')` → React Router navigation. No redesign, no behavior change.

**Tech Stack:** Vite 5, React 18.3.1, react-router-dom 6, TypeScript 5.5, Tailwind CSS 3 (PostCSS build), Vitest 2 (one unit test for the SSE parser), Playwright (existing smoke harness, repointed). Backend unchanged: Next.js 14, Prisma/SQLite.

**Conventions (read once, applies to all tasks):**
- **Branch:** do all work on `feat/vite-frontend` (create it in Task 0). Never commit to `main` directly.
- **EOL policy:** this repo uses `core.autocrlf=true` with no `.gitattributes`. Commit with **plain `git`** — never pass `-c core.autocrlf=false`. The "LF will be replaced by CRLF" warning is expected and fine.
- **`.claude/settings.local.json`** is tracked despite `.claude/` being git-ignored; if you ever need to add it use `git add -f`. You will not need to touch it here.
- **Verification is real:** never mark a step done from reasoning. Run the command, read the output.

---

## Porting rules (apply to EVERY `.jsx → .tsx` port task)

These rules turn a global-script `.jsx` file into an ES-module `.tsx` file. Apply all of them; the file's existing JSX/markup and logic are otherwise copied **verbatim** (faithful port — do not redesign, rename, or "improve" component internals).

1. **Hooks/React:** delete any `const { useState, useEffect, useRef, ... } = React;` and any reliance on a global `React`. Add at the top: `import { useState, useEffect, useRef /* + whatever the file uses */ } from 'react';`. (JSX itself needs no React import — tsconfig uses the automatic runtime.)
2. **Shared components:** replace uses of the old globals `Icon, WebI, NPCS_WEB, RELATIONSHIP_LABEL, WebAvatar, WebRelationshipDots, WebNavRail, WebConversationsRail, WebDock` with `import { ... } from '../components/shared';`.
3. **API client:** replace `window.API` / bare `API` with `import { api } from '../api/client';` and call `api.*`. (In `components/shared.tsx` the relative path is `../api/client` as well.)
4. **Navigation (page files):** add `import { useNavigate } from 'react-router-dom';` and `const navigate = useNavigate();` inside the component, then replace each `location.assign('<page>.html')` per this map:
   - `'main-app.html'` → `navigate('/')`
   - `'onboarding-journey.html'` → `navigate('/onboarding')`
   - `'scenario.html'` → `navigate('/scenario')`
5. **Navigation (shared link components):** convert inter-route `<a href="<page>.html">` to `import { Link } from 'react-router-dom';` + `<Link to="/route">` using the same map as rule 4. For the inert **Settings** item (href `'#'`, no route), render `<a href="#" onClick={(e) => e.preventDefault()}>`. For the **design-canvas** (legacy) link, render an absolute external link: `<a href="http://localhost:3100/app/design-canvas.html" target="_blank" rel="noreferrer">`.
6. **Mounting:** delete the file's own mount call at the bottom (`ReactDOM.render(...)` or `ReactDOM.createRoot(...).render(...)`) — mounting now happens once in `main.tsx`. Replace the root screen component's declaration so it is the **default export** (`export default function <Name>() { ... }`). Any other top-level component/const referenced by other files gets a named `export`.
7. **Typing (loose but useful):** add types where obvious; untyped function params are allowed (`tsconfig` sets `noImplicitAny: false`). Do not spend time fully typing a faithful port — `any`/`unknown` are acceptable to keep `tsc` clean. Do not change runtime behavior to satisfy a type.

---

## Task 0: Branch

- [ ] **Step 1: Create and switch to the feature branch**

Run:
```bash
git checkout -b feat/vite-frontend
```
Expected: `Switched to a new branch 'feat/vite-frontend'`

---

## Task 1: Scaffold the `web/` Vite + React + TS skeleton

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/index.html`,
  `web/postcss.config.js`, `web/tailwind.config.ts`, `web/.gitignore`,
  `web/src/main.tsx`, `web/src/vite-env.d.ts`,
  `web/src/styles/index.css`, `web/src/styles/tokens.css`,
  `web/src/routes/App.tsx`, `web/src/routes/Onboarding.tsx`, `web/src/routes/Scenario.tsx` (stubs)
- Modify: `package.json` (root scripts + `concurrently` devDep)

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "popcorn-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router-dom": "6.26.2"
  },
  "devDependencies": {
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "@vitejs/plugin-react": "4.3.1",
    "autoprefixer": "10.4.20",
    "postcss": "8.4.47",
    "tailwindcss": "3.4.13",
    "typescript": "5.5.4",
    "vite": "5.4.8",
    "vitest": "2.0.5"
  }
}
```

- [ ] **Step 2: Create `web/vite.config.ts`** (also serves as the Vitest config)

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite serves the SPA on :5173 and proxies /api to the Next.js backend on :3100.
// Same-origin from the browser's view → pop_uid cookie + SSE-over-POST pass through.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3100', changeOrigin: true },
    },
  },
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 3: Create `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "skipLibCheck": true,
    "strict": true,
    "noImplicitAny": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=1440, initial-scale=1" />
    <title>Popcorn Language</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `web/postcss.config.js` and `web/tailwind.config.ts`**

`web/postcss.config.js`:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

`web/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 6: Create `web/.gitignore`**

```
node_modules
dist
```

- [ ] **Step 7: Create the styles**

`web/src/styles/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`web/src/styles/tokens.css`: copy the file verbatim from `public/app/styles/tokens.css`.
```bash
cp public/app/styles/tokens.css web/src/styles/tokens.css
```
(`tokens.css` redefines `.font-serif` / `.font-mono`; it MUST load after Tailwind so it wins. `main.tsx` imports `index.css` first, then `tokens.css` — see Step 9.)

- [ ] **Step 8: Create stub route components**

`web/src/routes/App.tsx`:
```tsx
export default function App() {
  return <div data-stub="app">App route placeholder</div>;
}
```

`web/src/routes/Onboarding.tsx`:
```tsx
export default function Onboarding() {
  return <div data-stub="onboarding">Onboarding route placeholder</div>;
}
```

`web/src/routes/Scenario.tsx`:
```tsx
export default function Scenario() {
  return <div data-stub="scenario">Scenario route placeholder</div>;
}
```

- [ ] **Step 9: Create `web/src/main.tsx` and `web/src/vite-env.d.ts`**

`web/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

`web/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './routes/App';
import Onboarding from './routes/Onboarding';
import Scenario from './routes/Scenario';
import './styles/index.css';
import './styles/tokens.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/scenario" element={<Scenario />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 10: Update root `package.json` scripts + add `concurrently`**

In the root `package.json`, replace the `"dev"` script and add two helpers + a dev dependency. The `"scripts"` block becomes:
```json
"dev": "concurrently -n api,web -c blue,green \"npm:dev:api\" \"npm:dev:web\"",
"dev:api": "next dev -p 3100",
"dev:web": "npm --prefix web run dev",
"build": "next build",
"build:web": "npm --prefix web run build",
"start": "next start",
"test": "vitest run",
"test:watch": "vitest",
"db:migrate": "prisma migrate dev",
"db:seed": "prisma db seed",
"db:generate": "prisma generate",
"typecheck": "tsc --noEmit",
"report:ablation": "vitest run tests/integration/ablation-report",
"db:seed:demo": "tsx prisma/seed-demo.ts",
"smoke:web": "node scripts/smoke-web.mjs"
```
And add to root `devDependencies`:
```json
"concurrently": "8.2.2"
```

- [ ] **Step 11: Install deps**

Run:
```bash
npm install
npm --prefix web install
```
Expected: both complete without errors (root adds `concurrently`; `web/` installs Vite/React/etc.).

- [ ] **Step 12: Verify the skeleton typechecks and builds**

Run:
```bash
npm --prefix web run typecheck
npm --prefix web run build
```
Expected: `typecheck` exits 0 (no output); `build` prints a Vite build summary and exits 0, producing `web/dist/`.

- [ ] **Step 13: Verify the dev server boots and renders the stub**

Run (background) then probe:
```bash
npm --prefix web run dev &
# wait ~2s for Vite to be ready, then:
curl -s http://localhost:5173/ | grep -q 'id="root"' && echo OK
```
Expected: prints `OK` (the index.html is served). Stop the background dev server afterward.

- [ ] **Step 14: Commit**

```bash
git add web package.json package-lock.json
git commit -m "chore(web): scaffold Vite + React + TS SPA skeleton with /api proxy"
```

---

## Task 2: Port the API client (`api.js` → `web/src/api/client.ts`) + SSE parser unit test

**Files:**
- Read: `public/app/src/api.js` (the full file, 110 lines)
- Create: `web/src/api/client.ts`, `web/src/api/client.test.ts`

- [ ] **Step 1: Write the failing test for the SSE frame parser**

`web/src/api/client.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseFrame } from './client';

describe('parseFrame', () => {
  it('parses an event line + JSON data line', () => {
    expect(parseFrame('event: token\ndata: {"text":"hi"}')).toEqual({
      type: 'token',
      data: { text: 'hi' },
    });
  });

  it('defaults type to "message" and keeps a raw string when data is not JSON', () => {
    expect(parseFrame('data: hello')).toEqual({ type: 'message', data: 'hello' });
  });

  it('joins multiple data lines with newlines', () => {
    expect(parseFrame('event: x\ndata: a\ndata: b')).toEqual({ type: 'x', data: 'a\nb' });
  });

  it('returns null data for a frame with no data line', () => {
    expect(parseFrame('event: ping')).toEqual({ type: 'ping', data: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm --prefix web run test
```
Expected: FAIL — `parseFrame` is not exported / `client.ts` does not exist.

- [ ] **Step 3: Port `api.js` to `web/src/api/client.ts`**

Copy the logic from `public/app/src/api.js` **verbatim**, with these changes:
- Drop the surrounding IIFE wrapper `(function () { ... })();`.
- `export function parseFrame(frame: string): { type: string; data: unknown } { ... }` — keep its body exactly (event/data line parsing, `JSON.parse` with raw-string fallback).
- Keep `req`, `apiGet`, `apiPost`, `apiPut`, `streamPost` with the **same logic** (same-origin `fetch`, manual stream reader splitting on `\n\n`, `onEvent` callbacks). Add light TS types: `req(method: string, url: string, body?: unknown)`, `streamPost(url: string, body: unknown, onEvent: (e: { type: string; data: unknown }) => void)`.
- Replace `window.API = { ... }` with `export const api = { ... };` — keep **every** method exactly as-is:
  `me, login, register, logout, npcs, thread, streamMessage, profile, saveProfile, onboardingComplete, journey, relationships, streak, achievements, memories, settings, saveSettings, scenarioCatalog, sessions, session, acceptSession, declineSession, streamChoose`.
- Preserve the thrown `Error` shape from `req` (message from `data.error.message`, plus `err.status` and `err.body`). Declare a small helper type so `.status` is allowed, e.g. `interface ApiError extends Error { status?: number; body?: unknown }` and cast when throwing.

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm --prefix web run test
```
Expected: PASS — 4 passing tests.

- [ ] **Step 5: Typecheck**

Run:
```bash
npm --prefix web run typecheck
```
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/client.ts web/src/api/client.test.ts
git commit -m "feat(web): port API client with SSE-over-POST parser + unit test"
```

---

## Task 3: Repoint the Playwright smoke at the Vite SPA

**Files:**
- Rewrite: `scripts/smoke-web.mjs`

The current smoke drives `:3100/app/*.html` and waits on `window.API`. The SPA has no `window.API` global and lives on `:5173` (proxying `/api` to `:3100`). Rewrite it to: log in **through the proxy origin** (`:5173`, so the `pop_uid` cookie is scoped to `:5173` where the page runs), navigate to SPA routes, and probe the API via `page.context().request` against the same `:5173` origin.

- [ ] **Step 1: Replace `scripts/smoke-web.mjs` with the SPA version**

```js
// scripts/smoke-web.mjs — headless browser smoke for the Vite web client.
// Drives Microsoft Edge (channel: 'msedge') against a running dev setup:
//   Vite SPA on :5173 (proxies /api -> Next.js on :3100).
// Proves the UI renders values from the live API and degrades gracefully when Ollama is down.
//
// Usage:  node scripts/smoke-web.mjs <flow>     flow in api|chat|journey|scenario|all
// Pre-req: `npm run dev` is up (API :3100 + Vite :5173), and `npm run db:seed:demo` has run.
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const flow = process.argv[2] || 'all';
let failures = 0;

function ok(m) { console.log('  ok   - ' + m); }
function fail(m) { console.error('  FAIL - ' + m); failures++; }
function assert(cond, m) { cond ? ok(m) : fail(m); }

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('   [pageerror]', e.message));
  return page;
}

// Navigate to a SPA route and wait for React to mount (root has children).
async function gotoRoute(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const r = document.getElementById('root');
    return !!r && r.children.length > 0;
  }, null, { timeout: 15000 });
}

// Log in through the :5173 proxy so the pop_uid cookie is stored for the page origin.
async function login(page, u, p) {
  const r = await page.context().request.post(`${BASE}/api/auth/login`, { data: { username: u, password: p } });
  if (!r.ok()) throw new Error('login failed: ' + r.status());
}

async function flowApi(browser) {
  console.log('[api] proxy reachability + app boot');
  const page = await newPage(browser);
  await login(page, 'demo', 'demo');
  const me = await page.context().request.get(`${BASE}/api/auth/me`);
  const body = await me.json().catch(() => ({}));
  assert(me.ok() && body.user && body.user.username === 'demo',
    'GET /api/auth/me through Vite proxy returns demo user');
  await gotoRoute(page, '/');
  assert(true, 'main route ("/") mounted React');
}

async function flowChat(browser) {
  console.log('[chat] rail + thread + streaming send from live API');
  const page = await newPage(browser);
  await login(page, 'demo', 'demo');
  await gotoRoute(page, '/');

  // Seeded demo: Lily = Close friend (stage 3). The mock constant has Lily = Friend (2),
  // so "Lily ... Close friend" only appears when the rail reads /api/npcs.
  const lilyBtn = page.locator('button', { hasText: 'Lily' }).first();
  await lilyBtn.waitFor({ timeout: 15000 });
  const lilyText = (await lilyBtn.innerText()).replace(/\s+/g, ' ');
  assert(/Close friend/i.test(lilyText), 'Lily row shows API stage "Close friend" (got: ' + lilyText.slice(0, 60) + ')');

  const npcCount = await page.locator('button', { hasText: /Lily|Emma|Chen/ }).count();
  assert(npcCount >= 3, 'rail lists >=3 NPCs from API (got ' + npcCount + ')');

  // Thread history must load and render (regression guard for the GET endpoint).
  const histRes = await page.context().request.get(`${BASE}/api/threads/lily/messages?limit=50`);
  const hist = await histRes.json().catch(() => ({}));
  const firstMsg = (hist.messages && hist.messages[0] && hist.messages[0].text) || '';
  if (firstMsg) {
    const probe = firstMsg.slice(0, 24);
    const rendered = await page.waitForFunction(
      (t) => document.body.innerText.includes(t), probe, { timeout: 10000 }).then(() => true).catch(() => false);
    assert(rendered, 'prior thread history renders from /messages (probe: "' + probe + '")');
  } else {
    ok('thread has no prior history to assert (seed-dependent) — skipped');
  }

  // Send a message; Ollama may be up or down. Assert the user bubble appears and the
  // composer re-enables (never stuck).
  const box = page.locator('textarea');
  await box.fill('hello from smoke');
  await page.locator('button', { hasText: 'Send' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('hello from smoke'),
    null, { timeout: 15000 });
  ok('user message bubble rendered (user_message_saved)');
  try {
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Send/.test(x.textContent));
      return b && !b.disabled;
    }, null, { timeout: 30000 });
    ok('composer re-enabled after send (no hang)');
  } catch { fail('composer stayed disabled after send'); }
}

async function flowJourney(browser) {
  console.log('[journey] /onboarding renders live journey for demo');
  const page = await newPage(browser);
  await login(page, 'demo', 'demo');
  await gotoRoute(page, '/onboarding');
  await page.waitForTimeout(2000); // allow journey fetches
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  assert(/Lily/.test(body), 'journey view shows Lily (seeded close relationship)');
  assert(/Chen/.test(body), 'journey view shows Chen (seeded friend relationship)');
  assert(/Emma/.test(body), 'journey view shows Emma (seeded acquaintance relationship)');
  assert(/Close friend/i.test(body), 'journey view shows "Close friend" stage label for Lily');
}

async function flowScenario(browser) {
  console.log('[scenario] /scenario renders the seeded session');
  const page = await newPage(browser);
  await login(page, 'demo', 'demo');
  await gotoRoute(page, '/scenario');
  await page.waitForTimeout(2000);
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  assert(/A-|Mock Interview|Summary|Grade/i.test(body),
    'scenario view renders the seeded session summary');
}

const FLOWS = { api: flowApi, chat: flowChat, journey: flowJourney, scenario: flowScenario };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const run = flow === 'all' ? Object.keys(FLOWS) : [flow];
  for (const f of run) {
    if (!FLOWS[f]) { fail('unknown flow: ' + f); continue; }
    await FLOWS[f](browser);
  }
} finally {
  await browser.close();
}
console.log(failures === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Syntax-check the rewritten script**

Run:
```bash
node --check scripts/smoke-web.mjs
```
Expected: exits 0 (no syntax errors).

- [ ] **Step 3: Verify the `api` flow passes against the running app**

Pre-req: in a separate terminal, `npm run dev` is up and `npm run db:seed:demo` has been run. Then:
```bash
node scripts/smoke-web.mjs api
```
Expected: both `api` assertions `ok`, ending `SMOKE PASS`. (The `chat`/`journey`/`scenario` flows will not pass yet — their routes are still stubs; they are validated in Tasks 5–7.)

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-web.mjs
git commit -m "test: repoint web smoke at the Vite SPA routes and proxy"
```

---

## Task 4: Port shared UI components (`shared.jsx` → `web/src/components/shared.tsx`)

**Files:**
- Read: `public/app/src/shared.jsx` (310 lines)
- Create: `web/src/components/shared.tsx`

- [ ] **Step 1: Port the file**

Copy `public/app/src/shared.jsx` into `web/src/components/shared.tsx` verbatim, then apply the **Porting rules**:
- Rule 1: add `import { useState, useEffect } from 'react';` (used by `WebNavRail`); remove `const { useState, useEffect } = React;`.
- Rule 3: add `import { api } from '../api/client';`; in `WebNavRail` replace `if (window.API) window.API.journey().then(setJ)...` with `api.journey().then(setJ).catch(() => {});`.
- Rule 5: add `import { Link } from 'react-router-dom';`. Convert the inter-route `<a href>` links in `WebDock`, `WebNavRail`, and `WebConversationsRail`:
  - In `WebDock` the `items` array hrefs become routes: `'main-app.html'`→`'/'`, `'scenario.html'`→`'/scenario'`, `'onboarding-journey.html'`→`'/onboarding'`; render them with `<Link to={i.href} ...>`. The Canvas link `<a href="design-canvas.html">` becomes `<a href="http://localhost:3100/app/design-canvas.html" target="_blank" rel="noreferrer">`.
  - In `WebNavRail` the `items` hrefs become `'main-app.html'`→`'/'`, `'onboarding-journey.html'`→`'/onboarding'`, and Settings stays `'#'`. Render route items (`href` starts with `/`) as `<Link to={item.href} ...>` and the Settings item as `<a href="#" onClick={(e) => e.preventDefault()} ...>` (keep all the existing className/style).
  - In `WebConversationsRail` the Journey button `<a href="onboarding-journey.html" ...>` becomes `<Link to="/onboarding" ...>` (keep className/style).
- Rule 6: delete the trailing `Object.assign(window, { WebI, NPCS_WEB, ... });`. Instead add `export` to each symbol other files consume: `Icon` (optional), `WebI`, `NPCS_WEB`, `RELATIONSHIP_LABEL`, `WebAvatar`, `WebRelationshipDots`, `WebDock`, `WebNavRail`, `WebConversationsRail`. (Easiest: prefix each `const`/`function` declaration with `export`.)
- Rule 7: add light prop types where trivial (e.g. `WebAvatar({ npc, size = 40, hasSomething }: { npc: any; size?: number; hasSomething?: boolean })`). `any` for `npc` is fine.

- [ ] **Step 2: Typecheck**

Run:
```bash
npm --prefix web run typecheck
```
Expected: exits 0.

- [ ] **Step 3: Build**

Run:
```bash
npm --prefix web run build
```
Expected: Vite build succeeds (components compile even though no route imports them yet).

- [ ] **Step 4: Commit**

```bash
git add web/src/components/shared.tsx
git commit -m "feat(web): port shared UI components (icons, rails, avatars, dock)"
```

---

## Task 5: Port the main chat app (`app.jsx` → `web/src/routes/App.tsx`, route `/`)

**Files:**
- Read: `public/app/src/app.jsx` (460 lines)
- Rewrite: `web/src/routes/App.tsx` (replaces the Task 1 stub)

- [ ] **Step 1: Port the file**

Replace the stub `web/src/routes/App.tsx` with a faithful port of `public/app/src/app.jsx`, applying the **Porting rules**. Specifics for this file:
- Rule 1: import the React hooks the file uses (likely `useState, useEffect, useRef`).
- Rule 2: `import { WebI, NPCS_WEB, RELATIONSHIP_LABEL, WebAvatar, WebRelationshipDots, WebNavRail, WebConversationsRail } from '../components/shared';` (import exactly the symbols this file references).
- Rule 3: `import { api } from '../api/client';`.
- Rule 4: `import { useNavigate } from 'react-router-dom';`, add `const navigate = useNavigate();` in the root component; replace `app.jsx:361` `location.assign('onboarding-journey.html')` with `navigate('/onboarding')`.
- Rule 6: remove the bottom mount call; make the screen component the **default export** (`export default function App() { ... }`).
- Keep the chat UI markup, the streaming send via `api.streamMessage(...)`, the `textarea` composer and the `Send` button **verbatim** (the smoke asserts on `textarea`, a button reading `Send`, and the `Close friend` rail label).

- [ ] **Step 2: Typecheck + build**

Run:
```bash
npm --prefix web run typecheck && npm --prefix web run build
```
Expected: both succeed.

- [ ] **Step 3: Runtime smoke (chat flow)**

Pre-req: `npm run dev` up, `npm run db:seed:demo` done. Run:
```bash
node scripts/smoke-web.mjs chat
```
Expected: `SMOKE PASS` — rail shows `Close friend`, ≥3 NPCs, prior history renders, the `hello from smoke` bubble appears, composer re-enables. (If Ollama is down the composer still re-enables via the error path — that is a pass.)

- [ ] **Step 4: Commit**

```bash
git add web/src/routes/App.tsx
git commit -m "feat(web): port main chat app to the / route"
```

---

## Task 6: Port onboarding + journey (`onboarding.jsx` → `web/src/routes/Onboarding.tsx`, route `/onboarding`)

**Files:**
- Read: `public/app/src/onboarding.jsx` (819 lines)
- Rewrite: `web/src/routes/Onboarding.tsx` (replaces the Task 1 stub)

- [ ] **Step 1: Port the file**

Replace the stub `web/src/routes/Onboarding.tsx` with a faithful port of `public/app/src/onboarding.jsx`, applying the **Porting rules**. Specifics:
- Rule 2: import the shared symbols this file references (at minimum `WebNavRail`; import whatever else it uses).
- Rule 3: `import { api } from '../api/client';`.
- Rule 4: `import { useNavigate } from 'react-router-dom';`, add `const navigate = useNavigate();`; replace BOTH `location.assign('main-app.html')` calls (`onboarding.jsx:504` and `:530`) with `navigate('/')`.
- Rule 6: remove the mount call; `export default function Onboarding() { ... }`.
- Keep the onboarding flow and the journey dashboard markup verbatim (the smoke asserts the journey view shows `Lily`, `Chen`, `Emma`, and the `Close friend` label).

- [ ] **Step 2: Typecheck + build**

Run:
```bash
npm --prefix web run typecheck && npm --prefix web run build
```
Expected: both succeed.

- [ ] **Step 3: Runtime smoke (journey flow)**

Pre-req: `npm run dev` up, demo seeded. Run:
```bash
node scripts/smoke-web.mjs journey
```
Expected: `SMOKE PASS` — Lily/Chen/Emma and `Close friend` all render.

- [ ] **Step 4: Commit**

```bash
git add web/src/routes/Onboarding.tsx
git commit -m "feat(web): port onboarding + journey to the /onboarding route"
```

---

## Task 7: Port the scenario screen (`scenario.jsx` → `web/src/routes/Scenario.tsx`, route `/scenario`)

**Files:**
- Read: `public/app/src/scenario.jsx` (802 lines)
- Rewrite: `web/src/routes/Scenario.tsx` (replaces the Task 1 stub)

- [ ] **Step 1: Port the file**

Replace the stub `web/src/routes/Scenario.tsx` with a faithful port of `public/app/src/scenario.jsx`, applying the **Porting rules**. Specifics:
- Rule 2: import the shared symbols this file references.
- Rule 3: `import { api } from '../api/client';` — keep the mount-time `api.me().then(() => api.sessions())` logic that picks active→invited→completed, plus `api.session(id)`, `api.acceptSession`, `api.declineSession`, `api.streamChoose` exactly.
- Rule 4: `import { useNavigate } from 'react-router-dom';`, add `const navigate = useNavigate();`; replace `scenario.jsx:615` `location.assign('onboarding-journey.html')` with `navigate('/onboarding')`.
- Rule 6: remove the mount call; `export default function Scenario() { ... }`.
- Note: this screen takes **no route param** — it self-selects the session from `api.sessions()`. Do not add a `:id` param.

- [ ] **Step 2: Typecheck + build**

Run:
```bash
npm --prefix web run typecheck && npm --prefix web run build
```
Expected: both succeed.

- [ ] **Step 3: Runtime smoke (scenario flow)**

Pre-req: `npm run dev` up, demo seeded. Run:
```bash
node scripts/smoke-web.mjs scenario
```
Expected: `SMOKE PASS` — the seeded session summary (e.g. `Mock Interview` / grade `A-`) renders.

- [ ] **Step 4: Commit**

```bash
git add web/src/routes/Scenario.tsx
git commit -m "feat(web): port scenario screen to the /scenario route"
```

---

## Task 8: Update docs for the new run URLs (ripple effects)

**Files:**
- Modify: `README.md`, `docs/uat-sop.md`

URL mapping for both files:
- `http://localhost:3100/app/main-app.html` → `http://localhost:5173/`
- `http://localhost:3100/app/onboarding-journey.html` → `http://localhost:5173/onboarding`
- `http://localhost:3100/app/scenario.html` → `http://localhost:5173/scenario`
- `npm run dev` now starts **both** the API (`:3100`) and the Vite UI (`:5173`).

- [ ] **Step 1: Update `README.md`**

Apply these edits (read the file first to match exact surrounding text):
- Line ~36–38: the run block. Change the comment and the "open the web client" line so it reads that `npm run dev` brings up the API on `:3100` and the Vite UI on `:5173`, and the client opens at **`http://localhost:5173/`**.
- Line ~62–65 (Quick start / demo): change `Open http://localhost:3100/app/main-app.html` → `Open http://localhost:5173/`, and the onboarding/login reference `/app/onboarding-journey.html` → `http://localhost:5173/onboarding`.
- Lines ~124, ~138–144 (architecture / "The React UI lives in…"): replace the description "`public/app/` (CDN React + in-browser Babel — no build step)" with "`web/` — a Vite + React + TypeScript SPA (proxies `/api` to the Next.js backend); `public/app/` retains only the legacy `design-canvas.html`." Update the three bullet URLs:
  - Main app (chat): `http://localhost:5173/`
  - Onboarding / Journey: `http://localhost:5173/onboarding`
  - Scenario: `http://localhost:5173/scenario`
- Leave the **A note on auth** section unchanged.

- [ ] **Step 2: Update `docs/uat-sop.md`**

Apply these edits (read the file first to match exact text):
- Line ~20: "`http://localhost:3100/app/*`" → "`http://localhost:5173/*` (Vite SPA; `/api` proxied to the Next.js backend on `:3100`)".
- Line ~103: the `npm run dev` comment "serves API + UI on http://localhost:3100" → "starts the API on :3100 and the Vite UI on :5173".
- Line ~108: health check URL stays `http://localhost:3100/api/system/health` (the API is still on :3100 — do not change this one).
- Line ~112: "Open `http://localhost:3100/app/main-app.html` — the chat UI should load (CDN React + Babel…)" → "Open `http://localhost:5173/` — the chat UI should load (Vite SPA…)".
- Line ~175: "All cases start from `http://localhost:3100/app/...`" → "All cases start from `http://localhost:5173/...`".
- Replace the per-case page references with routes: `/app/onboarding-journey.html` → `/onboarding`; `/app/main-app.html` → `/`; `/app/scenario.html` → `/scenario` (lines ~202, ~206, ~212, ~214, ~219, ~227, ~262, ~278, ~287, ~314).

- [ ] **Step 3: Sanity-check no stale product URLs remain**

Run:
```bash
grep -rn "app/main-app.html\|app/onboarding-journey.html\|app/scenario.html" README.md docs/uat-sop.md
```
Expected: no matches (every product-page URL was repointed). `design-canvas.html` references, if any, are fine.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/uat-sop.md
git commit -m "docs: repoint README + UAT SOP at the Vite SPA run URLs"
```

---

## Task 9: Final verification & branch wrap-up

**Files:** none (verification only)

- [ ] **Step 1: Frontend typecheck, build, unit test all green**

Run:
```bash
npm --prefix web run typecheck && npm --prefix web run test && npm --prefix web run build
```
Expected: typecheck exits 0; Vitest reports the 4 `parseFrame` tests passing; Vite build succeeds.

- [ ] **Step 2: Backend untouched and still green**

Run:
```bash
npm test
```
Expected: the existing Vitest backend suite passes exactly as before (no `src/server` / `src/app/api` changes were made).

- [ ] **Step 3: Full runtime smoke across all routes**

Pre-req: `npm run dev` up (API :3100 + Vite :5173), `npm run db:seed:demo` done. Run:
```bash
node scripts/smoke-web.mjs all
```
Expected: `SMOKE PASS` — `api`, `chat`, `journey`, `scenario` flows all pass.

- [ ] **Step 4: Confirm no CDN React/Babel remain in the SPA**

Run:
```bash
grep -rn "babel/standalone\|unpkg.com/react\|cdn.tailwindcss" web/ ; echo "exit: $?"
```
Expected: no matches in `web/` (the SPA is fully built, not CDN-loaded). `public/app/*.html` may still match — that is the untouched legacy and is fine.

- [ ] **Step 5: Hand off to branch completion**

The implementation is complete and verified. Use the **superpowers:finishing-a-development-branch** skill to choose how to integrate `feat/vite-frontend` (the project's convention is `merge --no-ff` into `main` then push — confirm with the user before pushing).

---

## Notes on scope (carried from the spec)

- **Out of scope:** the Hono backend, a monorepo / shared zod package, migrating `design-canvas.html`, TanStack Query, and any visual redesign. All deferred to Phase 2+.
- The old product pages under `public/app/` (`main-app.html`, `onboarding-journey.html`, `scenario.html`, and their `src/*.jsx`) are now **superseded** but left in place this phase to keep the diff focused and preserve a reference; only `design-canvas.html` is still reachable as a product surface (via Next at `:3100/app/design-canvas.html`). Deleting the superseded files can be a small follow-up.
