# Wire Web Client to Live Backend (+ chat-model swap) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Popcorn product usable end-to-end on `localhost:3100` by connecting the
existing React UI to the real API, and switch the chat model to `qwen3.5:9b`.

**Architecture:** Serve the existing CDN-React + in-browser-Babel UI **same-origin** from the
Next backend (move `prototypes/web → public/app/`), so the `pop_uid` cookie and `/api/*`
calls work with no CORS and no build step. A thin `public/app/src/api.js` client (incl. an
SSE-over-POST reader) replaces the hardcoded mock constants in each of the three surfaces.

**Tech Stack:** Next.js 14 (static `public/` serving), React 18 UMD + Babel standalone (no
build), Prisma/SQLite, Vitest (backend, unchanged), headless-browser smoke for the UI.

**Design:** `docs/superpowers/specs/2026-05-31-frontend-wire-web-client-design.md`.

---

## Conventions for every task

- **Branch:** already on `frontend/wire-web-client`. **Commit with plain `git`** (the repo is
  `core.autocrlf=true`; plain git normalizes CRLF→LF on commit — the `LF will be replaced by
  CRLF` warning is normal). **Never** use `git -c core.autocrlf=false`. After committing new/
  text files, sanity-check `git ls-files --eol <file>` shows `i/lf`.
- **Scope guard:** `git add` only the files named in the task. Never `git add -A`/`.`.
  `.claude/settings.local.json` stays dirty/uncommitted. `dev.db*` are gitignored.
- **Dev server:** `npm run dev` serves on `http://localhost:3100`. Start it in the background
  when a task needs the running app; it serves `public/` statically and live-reloads.
- **Scope guards from the spec (do NOT raise these as findings):** auth is intentionally
  minimal (plaintext password, single-query login, `pop_uid=userId` cookie, no
  bcrypt/Auth.js/CSRF) — local-demo-only, not a contribution; the demo seed sets
  `password = username` on purpose. The CDN-React + in-browser-Babel, no-build setup is a
  deliberate zero-build choice. No API/route changes in this work.
- **UI verification (the "test" for browser tasks):** Vitest cannot drive this browser UI, so
  each UI task is proven by a **headless-browser smoke**: serve the app, act as a user, and
  assert that **API-derived values that do not exist in the mock constants** appear in the DOM
  (e.g. the seeded `demo` user's Lily = "Close friend"/stage 3, which the mock `NPCS_WEB` has
  as Lily = "Friend"/stage 2). This is what proves the UI reads the API, not the mocks. Run it
  with whatever headless driver is available (`npx playwright` if present, else the `run`
  skill's `chromium-cli`); if no headless browser is available, fall back to asserting the page
  HTML/JS loads (HTTP 200 for the page + `src/api.js`) and do a manual click-through, and say
  so in the task report. The backend Vitest suite (`npm test`) must stay green throughout.

---

## Task 1: Swap the chat model to `qwen3.5:9b`

Isolated backend change, real TDD. The functional switch is `.env`/`OllamaClient` default
(every route constructs `new OllamaClient()` with no args, so the model is
`process.env.OLLAMA_CHAT_MODEL ?? <fallback>`). The `settings.ts`/schema defaults are the
*displayed* model; switch them too so the settings screen and a fresh DB are consistent. The
**embed** model `nomic-embed-text` is unchanged.

**Files:**
- Modify: `.env:3`
- Modify: `src/server/llm/ollama.ts:25`
- Modify: `src/server/settings/settings.ts:20`
- Modify: `prisma/schema.prisma:48`
- Create: `prisma/migrations/<timestamp>_chat_model_qwen35/migration.sql` (via `prisma migrate dev`)
- Test: `tests/integration/chat-model-default.test.ts` (new) + update any existing test that
  hardcodes `qwen2.5:7b-instruct`.

- [ ] **Step 1: Find every test that asserts the old model**

Run: `npx vitest run --reporter=basic 2>/dev/null; grep -rn "qwen2.5:7b-instruct" tests src`
Expected: note each hit. Known production hits to change: `src/server/llm/ollama.ts:25`,
`src/server/settings/settings.ts:20`, `prisma/schema.prisma:48`. Any `tests/**` hit asserting
the old string must be updated to `qwen3.5:9b` in Step 5.

- [ ] **Step 2: Write the failing test**

Create `tests/integration/chat-model-default.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { OllamaClient } from '@/server/llm/ollama';
import { DEFAULT_SETTINGS } from '@/server/settings/settings';

describe('chat model default', () => {
  it('OllamaClient defaults the chat model to qwen3.5:9b when env is unset', async () => {
    const prev = process.env.OLLAMA_CHAT_MODEL;
    delete process.env.OLLAMA_CHAT_MODEL;
    try {
      const health = await new OllamaClient({ fetchImpl: async () => new Response('{}', { status: 500 }) }).health();
      expect(health.model).toBe('qwen3.5:9b');
    } finally {
      if (prev !== undefined) process.env.OLLAMA_CHAT_MODEL = prev;
    }
  });

  it('settings default modelName is qwen3.5:9b', () => {
    expect(DEFAULT_SETTINGS.modelName).toBe('qwen3.5:9b');
  });
});
```

NOTE: confirmed — `src/server/settings/settings.ts` exports
`export const DEFAULT_SETTINGS: SettingsView` (line 18) with `modelName` on line 20.

- [ ] **Step 3: Run the test, verify it fails**

Run: `npx vitest run tests/integration/chat-model-default.test.ts`
Expected: FAIL — `health.model` is `qwen2.5:7b-instruct` (and/or the settings assertion fails).

- [ ] **Step 4: Make the production changes**

- `.env` line 3: `OLLAMA_CHAT_MODEL="qwen3.5:9b"`
- `src/server/llm/ollama.ts:25`: `?? process.env.OLLAMA_CHAT_MODEL ?? 'qwen3.5:9b';`
- `src/server/settings/settings.ts:20`: `modelName: 'qwen3.5:9b',`
- `prisma/schema.prisma:48`: `modelName String @default("qwen3.5:9b")`

- [ ] **Step 5: Update any other test that hardcodes the old model**

For each `tests/**` hit from Step 1, change `qwen2.5:7b-instruct` → `qwen3.5:9b`.

- [ ] **Step 6: Generate the migration + regenerate client**

Run: `npx prisma migrate dev --name chat_model_qwen35`
Expected: a new migration folder under `prisma/migrations/` altering the `modelName` default;
Prisma client regenerated. (This also applies to `prisma/dev.db`.)

- [ ] **Step 7: Re-seed demo so the demo user's settings show the new model**

Run: `npm run db:seed:demo`
Expected: `Seeded demo user "demo"…`.

- [ ] **Step 8: Run the new test + full suite + typecheck**

Run: `npx vitest run tests/integration/chat-model-default.test.ts && npm test && npm run typecheck`
Expected: new test PASS; full suite green (the previously-223 count +2 here, all passing);
typecheck exit 0.

- [ ] **Step 9: Commit**

```bash
git add .env src/server/llm/ollama.ts src/server/settings/settings.ts prisma/schema.prisma prisma/migrations tests/integration/chat-model-default.test.ts
# plus any tests/** files edited in Step 5
git commit -m "feat: switch chat model to qwen3.5:9b (env + defaults + migration)"
```

---

## Task 2: Serve the UI same-origin from `public/app/`

**Files:**
- Move: `prototypes/web/` → `public/app/` (`git mv`)

- [ ] **Step 1: Move the directory with git**

Run: `git mv prototypes/web public/app`
Expected: `main-app.html`, `onboarding-journey.html`, `scenario.html`, `design-canvas.html`,
`src/*.jsx`, `styles/tokens.css` now live under `public/app/`.

- [ ] **Step 2: Confirm internal references are relative (no edit expected)**

Run: `grep -nE "src=\"|href=\"|stylesheet" public/app/main-app.html public/app/scenario.html public/app/onboarding-journey.html`
Expected: refs like `styles/tokens.css`, `src/shared.jsx`, `src/app.jsx` are **relative** — they
resolve under `/app/` unchanged. The cross-page nav (`WebDock`, `WebNavRail` in
`public/app/src/shared.jsx`) uses bare hrefs (`main-app.html`, `onboarding-journey.html`,
`scenario.html`) which also resolve correctly under `/app/`. No edits needed. If any ref is
absolute (`/src/...`), make it relative.

- [ ] **Step 3: Serve and verify each page loads from the backend origin**

Start the dev server in the background (`npm run dev`), wait for ready, then:

Run:
```bash
for p in main-app onboarding-journey scenario; do
  echo -n "$p "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/app/$p.html
done
curl -s -o /dev/null -w "tokens.css %{http_code}\n" http://localhost:3100/app/styles/tokens.css
curl -s -o /dev/null -w "shared.jsx %{http_code}\n" http://localhost:3100/app/src/shared.jsx
```
Expected: every line `200`.

- [ ] **Step 4: Commit**

```bash
git add -A public/app prototypes
git commit -m "chore: serve web client same-origin from public/app (was prototypes/web)"
```
NOTE: `git mv` stages the rename; `git add -A public/app prototypes` captures the move
precisely (only these paths). Verify with `git status --short` that nothing else is staged.

---

## Task 3: Client API layer — `public/app/src/api.js`

**Files:**
- Create: `public/app/src/api.js`
- Modify: `public/app/main-app.html`, `public/app/onboarding-journey.html`,
  `public/app/scenario.html` (add `<script src="src/api.js">` before the page's component
  script and after `shared.jsx`).

- [ ] **Step 1: Write `public/app/src/api.js`**

```js
// public/app/src/api.js — thin same-origin client for the Popcorn backend.
// Loaded as a plain global script (window.API) before each page's component script.
(function () {
  async function req(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts); // same-origin → pop_uid cookie sent automatically
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || res.statusText;
      const err = new Error(msg);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }
  const apiGet = (u) => req('GET', u);
  const apiPost = (u, b) => req('POST', u, b === undefined ? {} : b);
  const apiPut = (u, b) => req('PUT', u, b);

  // SSE over POST: EventSource cannot POST, so read the stream manually.
  // Calls onEvent({ type, data }) per `event:`/`data:` frame.
  async function streamPost(url, body, onEvent) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      onEvent({ type: 'error', data: { code: 'NETWORK', message: String(e) } });
      return;
    }
    if (!res.ok || !res.body) {
      let data = null;
      try { data = await res.json(); } catch (e) { /* ignore */ }
      onEvent({ type: 'error', data: (data && data.error) || { code: 'HTTP_' + res.status, message: res.statusText } });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (frame.trim()) onEvent(parseFrame(frame));
      }
    }
    if (buf.trim()) onEvent(parseFrame(buf));
  }
  function parseFrame(frame) {
    let type = 'message';
    const dataLines = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) type = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    let data = null;
    const raw = dataLines.join('\n');
    if (raw) { try { data = JSON.parse(raw); } catch (e) { data = raw; } }
    return { type, data };
  }

  window.API = {
    // auth/session
    me: () => apiGet('/api/auth/me'),
    login: (username, password) => apiPost('/api/auth/login', { username, password }),
    register: (username, password) => apiPost('/api/auth/register', { username, password }),
    logout: () => apiPost('/api/auth/logout', {}),
    // chat
    npcs: () => apiGet('/api/npcs'),
    thread: (npcId, limit) => apiGet('/api/threads/' + npcId + '?limit=' + (limit || 50)),
    streamMessage: (npcId, text, onEvent) =>
      streamPost('/api/threads/' + npcId + '/messages', { text: text }, onEvent),
    // onboarding / journey / profile
    profile: () => apiGet('/api/profile'),
    saveProfile: (p) => apiPut('/api/profile', p),
    onboardingComplete: () => apiPost('/api/onboarding/complete', {}),
    journey: () => apiGet('/api/journey/summary'),
    relationships: () => apiGet('/api/journey/relationships'),
    streak: () => apiGet('/api/journey/streak'),
    achievements: () => apiGet('/api/achievements'),
    memories: () => apiGet('/api/memories'),
    settings: () => apiGet('/api/settings'),
    saveSettings: (s) => apiPut('/api/settings', s),
    // scenario
    scenarioCatalog: () => apiGet('/api/scenarios/catalog'),
    sessions: (query) => apiGet('/api/scenarios/sessions' + (query || '')),
    session: (id) => apiGet('/api/scenarios/sessions/' + id),
    acceptSession: (id) => apiPost('/api/scenarios/sessions/' + id + '/accept', {}),
    declineSession: (id, reason) =>
      apiPost('/api/scenarios/sessions/' + id + '/decline', reason ? { reason: reason } : {}),
    streamChoose: (id, choiceId, onEvent, extra) =>
      streamPost('/api/scenarios/sessions/' + id + '/choose',
        Object.assign({ choiceId: choiceId }, extra || {}), onEvent),
  };
})();
```

- [ ] **Step 2: Load `api.js` on all three pages**

In each of `public/app/main-app.html`, `public/app/onboarding-journey.html`,
`public/app/scenario.html`, add immediately **after** the `src/shared.jsx` script tag and
**before** the page's own component script (e.g. `src/app.jsx`):

```html
<script type="text/babel" src="src/api.js"></script>
```

NOTE: `api.js` is plain ES5-ish JS, but loading it via `type="text/babel"` keeps ordering
deterministic with the other Babel-transpiled scripts (Babel runs them in document order).
Plain `<script src="src/api.js">` also works but executes before Babel scripts; use the
`text/babel` form to guarantee `window.API` exists before the component script runs.

- [ ] **Step 3: Verify `window.API` is wired (headless smoke)**

With the dev server running, drive a headless browser to `http://localhost:3100/app/main-app.html`,
then evaluate in the page context:
```js
typeof window.API === 'object' && typeof window.API.streamMessage === 'function'
  && (await window.API.me().then(() => 'OK').catch(e => 'status:' + e.status))
```
Expected: `API` is an object with `streamMessage`; `API.me()` resolves to a user object (if a
session cookie is present) or rejects with `status:401` (no session) — either proves the client
reaches `/api/*` same-origin. If no headless browser is available, fall back to Step 3 of Task 2
(page + `src/api.js` both 200) and note manual console verification.

- [ ] **Step 4: Commit**

```bash
git add public/app/src/api.js public/app/main-app.html public/app/onboarding-journey.html public/app/scenario.html
git commit -m "feat: add same-origin API client (api.js) to the web client"
```

---

## Task 4: Wire the chat surface to the API

Convert `app.jsx` + the conversations rail in `shared.jsx` from mock constants to live data,
lift chat state into `App`, and make the composer actually send via `API.streamMessage`.

**Files:**
- Modify: `public/app/src/shared.jsx` (make `WebConversationsRail` take `npcs` as a prop)
- Modify: `public/app/src/app.jsx` (App owns data + send; Composer gains `onSend`)

**API → UI npc mapper (used in `app.jsx`):** `/api/npcs` returns
`{id, name, avatar:{glyph,bg,ink}, status, relationship, stageValue, lastMessage, lastTime, hasSomething}`.
The components expect `{id, name, avatarGlyph, avatarBg, avatarInk, relationship, stageValue,
status, lastPreview, time, hasSomething}`.

**API → UI message mapper:** `/api/threads/:id` returns
`{ messages: [{ id, role, text, from:'user'|'npc', correction:{fixed,noteZh,tag}|null, createdAt }], hasMore }`.
The components expect `{ from, text, time, correction }`.

**SSE event sequence from `API.streamMessage`** (handle each `onEvent({type,data})`):
`user_message_saved {messageId,createdAt}` → `typing_start {npcId}` → `token {delta}` (repeat)
→ `typing_end {npcId}` → `message_complete {messageId, fullText}` → `correction
{targetMessageId, correction}` → optional `scenario_offer {…}` → `done {}`. On failure:
`error {code,message}` → `typing_end` → `done`.

- [ ] **Step 1: Make `WebConversationsRail` take `npcs` as a prop (shared.jsx)**

In `public/app/src/shared.jsx`, change the signature and the list source:
```js
function WebConversationsRail({ npcs = [], activeId, onSelect, intense }) {
  // ...unchanged markup until the list...
  // replace `{NPCS_WEB.map((npc) =>` with:
  {npcs.map((npc) =>
  // ...unchanged...
}
```
Leave `NPCS_WEB` defined (other code/tests may reference it) but the rail no longer reads the
global. Keep the `Object.assign(window, {...})` export list as-is.

- [ ] **Step 2: Add the mappers + data loading + send handler in `App` (app.jsx)**

Replace the `App` component (lines ~308–343) and `Composer` (lines ~152–197) so that:

```js
function mapNpc(a) {
  return {
    id: a.id, name: a.name,
    avatarGlyph: a.avatar ? a.avatar.glyph : '?',
    avatarBg: a.avatar ? a.avatar.bg : 'var(--surface-2)',
    avatarInk: a.avatar ? a.avatar.ink : 'var(--ink)',
    relationship: a.relationship, stageValue: a.stageValue,
    status: a.status || '', lastPreview: a.lastMessage || '',
    time: a.lastTime ? fmtTime(a.lastTime) : '',
    hasSomething: !!a.hasSomething,
  };
}
function mapMsg(m) {
  return { id: m.id, from: m.from, text: m.text,
           time: m.createdAt ? fmtTime(m.createdAt) : '',
           correction: m.correction || null };
}
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function App() {
  const [npcs, setNpcs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [streaming, setStreaming] = useState('');   // live NPC token buffer
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(-1);
  const [offer, setOffer] = useState(null);          // scenario_offer payload
  const scrollRef = useRef(null);

  // auth gate + initial NPC load
  useEffect(() => {
    API.me()
      .then(() => API.npcs())
      .then((list) => {
        const mapped = list.map(mapNpc);
        setNpcs(mapped);
        setActiveId((cur) => cur || (mapped[0] && mapped[0].id));
      })
      .catch((e) => {
        if (e.status === 401) location.assign('onboarding-journey.html');
      });
  }, []);

  // load thread when active NPC changes
  useEffect(() => {
    if (!activeId) return;
    setOffer(null); setStreaming(''); setTyping(false);
    API.thread(activeId)
      .then((r) => setMessages((r.messages || []).map(mapMsg)))
      .catch(() => setMessages([]));
  }, [activeId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming, typing]);

  function send(text) {
    if (!text.trim() || sending || !activeId) return;
    setSending(true); setStreaming('');
    let acc = '';
    API.streamMessage(activeId, text, (ev) => {
      const d = ev.data || {};
      switch (ev.type) {
        case 'user_message_saved':
          setMessages((m) => m.concat([{ id: d.messageId, from: 'user', text: text,
            time: fmtTime(d.createdAt || Date.now()), correction: null }]));
          break;
        case 'typing_start': setTyping(true); break;
        case 'token': acc += d.delta || ''; setStreaming(acc); break;
        case 'typing_end': setTyping(false); break;
        case 'message_complete':
          setStreaming('');
          setMessages((m) => m.concat([{ id: d.messageId, from: 'npc',
            text: d.fullText || acc, time: fmtTime(Date.now()), correction: null }]));
          break;
        case 'correction':
          setMessages((m) => m.map((x) => x.id === d.targetMessageId
            ? Object.assign({}, x, { correction: d.correction }) : x));
          break;
        case 'scenario_offer': setOffer(d); break;
        case 'error':
          setTyping(false); setStreaming('');
          setMessages((m) => m.concat([{ id: 'err-' + Date.now(), from: 'npc', error: true,
            text: (d.code === 'LLM_UNAVAILABLE'
              ? 'Local model unavailable — start Ollama (qwen3.5:9b) and retry.'
              : ('Error: ' + (d.message || d.code))), time: fmtTime(Date.now()), correction: null }]));
          break;
        case 'done': setSending(false); break;
        default: break;
      }
    }).catch(() => setSending(false));
  }

  const npc = npcs.find((n) => n.id === activeId);
  if (!npc) {
    return <div className="app-shell" data-screen-label="01 Web · Main App"
                style={{ display: 'grid', placeItems: 'center' }}>
             <span style={{ color: 'var(--muted)' }}>Loading…</span>
           </div>;
  }

  return (
    <div className="app-shell" data-screen-label="01 Web · Main App">
      <WebConversationsRail npcs={npcs} activeId={activeId} onSelect={setActiveId} />
      <section className="pane-main">
        <WebChatHeader npc={npc} />
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
          <div className="max-w-[820px] mx-auto py-2">
            <DayDivider label="Today · 今天" />
            {messages.map((m, i) => (
              <MessageRow key={m.id || i} npc={npc} msg={m}
                          showCorrection={!!m.correction && expanded === i}
                          onToggle={() => setExpanded(expanded === i ? -1 : i)} />
            ))}
            {streaming && <MessageRow npc={npc} msg={{ from: 'npc', text: streaming, time: '' }}
                                      showCorrection={false} onToggle={() => {}} />}
            {typing && <Typing npc={npc} />}
            {offer && (
              <div className="my-3 p-3 rounded-xl" style={{ background: 'var(--plum-soft)', border: '1px solid var(--plum)' }}>
                <div className="text-[12.5px] font-medium" style={{ color: 'var(--plum-ink)' }}>
                  ✨ {offer.title || 'A scenario is available'}
                </div>
                <a href={'scenario.html'} className="text-[11px] underline" style={{ color: 'var(--plum-ink)' }}>
                  Open scenario →
                </a>
              </div>
            )}
          </div>
        </div>
        <Composer onSend={send} disabled={sending} />
      </section>
      <RightPanel npc={npc} />
      <WebDock current="01 Main App" />
    </div>
  );
}
```

Update `Composer` to accept `{ onSend, disabled }`, keep its chips/markup, and call
`onSend(draft)` (then clear `draft`) on the Send button click and on ⌘/Ctrl+↵:
```js
function Composer({ onSend, disabled }) {
  const [draft, setDraft] = useState('');
  const submit = () => { const t = draft.trim(); if (!t || disabled) return; onSend(t); setDraft(''); };
  // chips unchanged; textarea adds:
  //   onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); } }}
  // Send button: onClick={submit} disabled={!draft.trim() || disabled}
}
```

Also handle the optional `msg.error` style in `MessageRow` (a greyed/failed NPC bubble): when
`msg.error` is truthy, render the received bubble with `opacity: 0.7` and an error tint — a
minimal change to the existing `style` for the non-user branch.

- [ ] **Step 3: Headless smoke — chat reads the API, sends, degrades gracefully**

Pre-req: dev server running; Ollama **down** (the common local case); `npm run db:seed:demo`
has been run (Task 1 Step 7). Drive a headless browser:
1. POST-login the `demo` user first (set the cookie) by navigating to a small bootstrap: in the
   page context run `await API.login('demo','demo')`, then `location.reload()`.
2. Wait for the conversations rail; assert it lists **three** NPCs and that **Lily shows "Close
   friend"** (stageValue 3) — a value that exists only in the seeded DB, **not** in the mock
   `NPCS_WEB` (where Lily is "Friend"/2). This proves the rail reads `/api/npcs`.
3. Type "hello" and Send. Assert a **user** bubble "hello" appears (from `user_message_saved`),
   then a greyed error bubble mentioning the local model (from the `LLM_UNAVAILABLE` SSE event),
   and that the composer is **re-enabled** (not stuck disabled).

Expected: all three assertions hold. (If no headless browser is available: manually click
through the above with the dev server running and Ollama down, and report what you observed.)

- [ ] **Step 4: Commit**

```bash
git add public/app/src/shared.jsx public/app/src/app.jsx
git commit -m "feat: wire chat surface to live API (npcs, thread, streaming send, correction)"
```

---

## Task 5: Wire onboarding + journey to the API

**Files:**
- Modify: `public/app/src/onboarding.jsx`

The wizard (`WelcomeStep` → `ProfileStep` (role/goal/interests) → `MeetStep`) and a journey/
progress view currently use the constants `ROLES`, `GOALS`, `INTERESTS`, `RELATIONSHIPS`,
`SCENARIOS`. Backend mapping:
- `PUT /api/profile` body `{ role, goal, interests: string[], language }` (interests is an array;
  the wizard's multi-select goals collapse to a single `goal` — send the first selected, or
  join with ", ").
- `POST /api/onboarding/complete` (auth required) seeds the Lily thread + intro message.
- Journey view reads `GET /api/journey/summary` `{days, conversations, scenarios, memories}`,
  `GET /api/journey/relationships` `[{npcId,name,stage,stageValue,sub,note,last}]`,
  `GET /api/journey/streak`, `GET /api/achievements`
  `[{id,title,description,icon,unlocked,unlockedAt}]`.

- [ ] **Step 1: Add a username field + auth to the wizard finish**

In `ProfileStep` (or the final step before completion) add one text input bound to a
`username` state (label e.g. "Pick a username"). On the wizard's final "Start"/"Finish"
action, run:
```js
async function finishOnboarding({ username, role, goal, interests }) {
  try {
    await API.register(username, username);           // demo convention: password = username
  } catch (e) {
    if (e.status === 409) await API.login(username, username); // username taken → log in
    else throw e;
  }
  await API.saveProfile({ role: role || null, goal: goal || null, interests: interests || [] });
  await API.onboardingComplete();
  location.assign('main-app.html');
}
```
Wire the finish button to call `finishOnboarding(...)` with the collected wizard state; disable
it while the promise is in flight and surface any thrown `e.message` inline.

- [ ] **Step 2: Add a returning-user login affordance**

On `onboarding-journey.html`, on mount call `API.me()`. If it resolves (already logged in),
render the journey/progress view with live data (Step 3). If it rejects with 401, show the
wizard for new users **plus** a compact "Already have an account? Log in" form (username +
password → `API.login(u,p)` then `location.assign('main-app.html')`). Keep this minimal —
two inputs and a button reusing existing styles.

- [ ] **Step 3: Replace journey mock constants with live data**

Where the progress view renders `RELATIONSHIPS`/`SCENARIOS`/streak counts, load on mount:
```js
const [journey, setJourney] = useState(null);
const [rels, setRels] = useState([]);
const [achs, setAchs] = useState([]);
useEffect(() => {
  Promise.all([API.journey(), API.relationships(), API.achievements()])
    .then(([j, r, a]) => { setJourney(j); setRels(r); setAchs(a); })
    .catch(() => {});
}, []);
```
Map `rels` to the relationship rows the view renders (name, stage label from `stage`, dots from
`stageValue`); render the streak/conversation/scenario/memory counts from `journey`; render
`achs` (unlocked vs locked) in the achievements section. Keep the existing markup; only swap the
data source. For any sub-field the API does not provide, render a sensible default rather than a
mock value.

- [ ] **Step 4: Headless smoke — onboarding creates a real account; journey shows real data**

With the dev server running:
1. Navigate to `http://localhost:3100/app/onboarding-journey.html`, run the wizard, set a
   unique username (e.g. `web_<timestamp>`), finish. Assert the browser navigates to
   `main-app.html` and that `await API.me()` in the page returns that username.
2. Navigate back to the journey view; assert the relationships section shows **Lily** (seeded by
   `onboarding/complete`) and the streak/summary numbers come from `/api/journey/summary` (a new
   user shows `days: 0` — which the mock `RELATIONSHIPS`/`SCENARIOS` never showed).

Expected: account is created server-side (verifiable via `API.me()`), journey renders live
data. (No headless browser → manual click-through + report.)

- [ ] **Step 5: Commit**

```bash
git add public/app/src/onboarding.jsx
git commit -m "feat: wire onboarding (register/profile/complete) and journey to live API"
```

---

## Task 6: Wire the scenario surface to the API

**Files:**
- Modify: `public/app/src/scenario.jsx`

Scenario sessions are created by the chat `scenario_offer` (no standalone create endpoint), so
the scenario page is a **live session player** driven by the user's real sessions:
- `GET /api/scenarios/sessions` → `[{ id, status, npcId, template:{…}, summary:{…} }]` (statuses:
  `invited` / `active` / `completed` / `declined`). Read exact item shape from
  `src/server/scenario/sessionView.ts` (`mapSessionListItem`).
- `POST /api/scenarios/sessions/:id/accept` → opening turn JSON (read
  `src/server/scenario/accept.ts` for the returned shape: opening NPC line + initial
  state/choices).
- `POST /api/scenarios/sessions/:id/choose` (SSE) per turn → events `token {delta}` →
  `state_update {…}` → `choices {…}` → terminal `scenario_end {…}` (verify event names + payloads
  in `src/server/scenario/turn.ts`). Body `{ choiceId, tone?, text? }`.
- `GET /api/scenarios/catalog` → templates (already used by the chat offer) for titles/tags.

- [ ] **Step 1: Load real sessions on mount; pick what to render**

Replace the mock `THREAD_A_WEB`/`THREAD_B_WEB`/`THREAD_D_WEB`/`LINDA_MESSAGES`/`CHOICES`
constants with state loaded on mount:
```js
useEffect(() => {
  API.me().then(() => API.sessions()).then((list) => {
    // prefer an active session, else an invited one, else the most recent completed
    const active = list.find((s) => s.status === 'active');
    const invited = list.find((s) => s.status === 'invited');
    const done = list.find((s) => s.status === 'completed');
    setSession(active || invited || done || null);
  }).catch((e) => { if (e.status === 401) location.assign('onboarding-journey.html'); });
}, []);
```

- [ ] **Step 2: Render by session status**

- `invited` → render the `InvitationCard` with template title/tags; an **Accept** button calls
  `API.acceptSession(id)` then transitions to the active turn view with the returned opening
  line + choices; a **Decline** button calls `API.declineSession(id)`.
- `active` → render the scenario chat + HUD; each choice button calls
  `API.streamChoose(id, choiceId, onEvent)`, appending tokens to the NPC turn, updating the HUD
  from `state_update`, replacing the choice set from `choices`, and rendering the
  `ScenarioSummaryCard` on `scenario_end`. Handle `error` (e.g. `LLM_UNAVAILABLE`) by showing
  an inline failed turn and re-enabling the choices — never hang.
- `completed` → render the `ScenarioSummaryCard` from the session's `summary` (grade + notes).
- none → an empty state: "No scenarios yet — keep chatting with an NPC to unlock one," with a
  link back to `main-app.html`.

Map API turn/message data to the existing `ScenMessage`/HUD components; keep the markup, swap the
data source. The streaming-token handling mirrors Task 4's `streamMessage` loop (accumulate
`token` deltas into the in-progress NPC turn).

- [ ] **Step 3: Headless smoke — scenario renders real session data**

Pre-req: dev server running; `npm run db:seed:demo` has seeded a **completed** `mock_interview`
session for `demo`. Drive a headless browser:
1. In page context `await API.login('demo','demo')`, then navigate to
   `http://localhost:3100/app/scenario.html`.
2. Assert the page renders the **summary card** for the seeded completed session and shows its
   grade (the seed sets grade `A-`) — a value from `/api/scenarios/sessions`, not the mock
   constants.

Expected: the summary reflects the seeded session. (A full live play — accept → choose →
end — requires Ollama and an invited session from chat; verify that manually once the model is
pulled.) (No headless browser → manual click-through + report.)

- [ ] **Step 4: Commit**

```bash
git add public/app/src/scenario.jsx
git commit -m "feat: wire scenario surface to live session lifecycle"
```

---

## Task 7: Final verification + run docs

**Files:**
- Modify: `README.md` (update the run/demo section: UI URL, model)

- [ ] **Step 1: Full backend suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all backend tests green (223 + the 2 added in Task 1), typecheck exit 0.

- [ ] **Step 2: End-to-end manual/headless walkthrough (dev server up)**

With Ollama **down**: confirm the three pages load same-origin, login as `demo`/`demo` works,
the chat NPC list/journey/scenario summary render from the API, and a chat send shows the
graceful `LLM_UNAVAILABLE` bubble with the composer re-enabled. Record the result in the task
report. (If Ollama + `qwen3.5:9b` are available, also confirm a real streamed reply + a grammar
correction appear.)

- [ ] **Step 3: Update README run/demo section**

In `README.md`, update the demo/run section to: start `npm run dev` (port 3100); open
`http://localhost:3100/app/main-app.html`; `npm run db:seed:demo` then log in as `demo`/`demo`;
note the chat model is now `qwen3.5:9b` (pull via `ollama pull qwen3.5:9b`; if the tag is
unavailable use the nearest Qwen chat tag and set `OLLAMA_CHAT_MODEL` in `.env`). Keep the
existing auth-scope and local-only callouts.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README run/demo section for the wired web client + qwen3.5:9b"
```

---

## Self-review notes (addressed)

- **Spec coverage:** serving same-origin (T2), api.js incl. SSE-over-POST (T3), chat wiring
  (T4), onboarding+journey incl. the added username field and the register/login→profile→
  complete sequence (T5), scenario lifecycle (T6), model swap incl. embed-unchanged + migration
  (T1), 223-tests-green + headless smoke verification (every UI task + T7), README (T7). All
  spec sections map to a task.
- **Type/name consistency:** the client is `window.API` with the exact method names used across
  T4–T6 (`me/login/register/npcs/thread/streamMessage/saveProfile/onboardingComplete/journey/
  relationships/achievements/sessions/acceptSession/declineSession/streamChoose`). The SSE event
  names match the backend (`user_message_saved/typing_start/token/typing_end/message_complete/
  correction/scenario_offer/error/done`; scenario `token/state_update/choices/scenario_end` —
  verified against `turn.ts` in T6 Step 1).
- **Unverified-but-flagged:** the `qwen3.5:9b` Ollama tag (T1/T7 note a one-line fallback); the
  exact `settings.ts` defaults export name (T1 Step 2 note); the scenario `accept`/`turn`
  payload shapes (T6 instructs reading `accept.ts`/`turn.ts` for exact fields).
