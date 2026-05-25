# W2 — Chat + SSE Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the seeded W1 foundation into a live conversation loop — register/login, onboarding writeback, NPC + thread reads, and a Server-Sent-Events streaming chat so the Main App can actually talk to Lily.

**Architecture:** Thin Next.js App Router route handlers call `requireUser()` first, then delegate to small, unit-testable helpers under `src/server/` that take `prisma` (the singleton in routes; a test client in tests) and a `OllamaClient` (real in routes; `fetchImpl`-mocked in tests). The chat endpoint is an async generator yielding `SseEvent` objects that a stream helper encodes into `text/event-stream`. All business queries are scoped by the authenticated `userId`.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Prisma + SQLite, Zod, Vitest, Ollama HTTP API, Server-Sent Events.

**Spec:** `docs/superpowers/specs/2026-05-25-backend-roadmap-design.md` (v2) — §四 (auth), §五.1–4 (auth/profile/npcs/threads APIs), §六 (SSE protocol), §十 workflow A.

---

## Scope

**In scope (W2):**
- Auth: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- Profile/onboarding: `GET/PUT /api/profile`, `POST /api/onboarding/complete`.
- NPCs: `GET /api/npcs`, `GET /api/npcs/:id`.
- Threads/Messages: `GET /api/threads/:npcId/messages` (paginated), `POST /api/threads/:npcId/messages` (**SSE chat**), `DELETE /api/threads/:npcId` (clear).
- SSE events emitted in W2: `user_message_saved · typing_start · token · message_complete · typing_end · error · done`.

**Explicitly deferred (later phases — do NOT build here):**
- `correction` event + `POST .../:msgId/correction` + grammar worker → **W5** (Module 6).
- `suggestions_update` event + `GET .../suggestions` chips → **W5**.
- `scenario_offer / state_update / choices / scenario_end` + triggerJudge → **W4** (Module 4).
- Memory `recall()` wired into the prompt (W2 uses only the recent-message buffer) → **W3** (Module 3).
- Relationship stage-up events + achievement ticks fired from chat → **W5** (the W2 chat loop bumps `relationshipPoints`/`conversationCount` and writes an `ActivityEvent`, but does not evaluate stage-ups or achievements).

## Conventions (inherited from W1)

- **Unit tests** (`tests/unit/`) run with **no DB and no Ollama** — pure functions or `fetchImpl`-mocked `OllamaClient`.
- **Integration tests** (`tests/integration/`) hit the migrated SQLite `dev.db` and a **mocked** Ollama; never a live model. Use usernames prefixed `__w2_…__` and delete them in `afterAll`; `User` cascades clean up threads/messages/relationships/etc.
- New routes return **plain `Response.json(...)`** (Web standard, Node 20+) — not `NextResponse` — so helpers stay testable outside Next. Route handlers may return a plain `Response` (including the SSE stream).
- Every business route's first line resolves the user via `requireUser` / `withUser`; all queries are `where userId`.
- TDD: failing test → watch it fail → minimal implementation → watch it pass → commit. One commit per task.
- **SCOPE GUARD (every task):** before committing run `git status --short`; `git add` ONLY the files this task names; NEVER `git add -A` / `git add .`. If anything else is dirty (especially `docs/backend.md`, other plan/spec docs), STOP and report — do not commit it.

## File Structure

**New helpers (`src/server/`):**
- `http/respond.ts` — `json()`, `errorJson()`, `withUser()` (401-on-missing wrapper).
- `sse/events.ts` — `SseEvent` type, `encodeSseEvent()`, `sseResponse()`.
- `text/langDetect.ts` — `detectLang(text) → 'en'|'zh'|'mixed'`.
- `users/streak.ts` — `computeStreak(dates, now) → { days, weekCount, perDay }`.
- `auth/accounts.ts` — `registerAccount()`, `loginAccount()`, `UsernameTakenError`.
- `chat/threads.ts` — `mapMessageToApi()`.
- `chat/streamChat.ts` — `streamChat(deps) → AsyncGenerator<SseEvent>` (core orchestration).

**New route handlers (`src/app/api/`):**
- `auth/register/route.ts`, `auth/login/route.ts`, `auth/logout/route.ts`, `auth/me/route.ts`
- `profile/route.ts` (GET+PUT)
- `onboarding/complete/route.ts`
- `npcs/route.ts` (GET), `npcs/[id]/route.ts` (GET)
- `threads/[npcId]/messages/route.ts` (GET+POST), `threads/[npcId]/route.ts` (DELETE)

---

### Task 1: HTTP response helpers

**Files:**
- Create: `src/server/http/respond.ts`
- Test: `tests/unit/http-respond.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { json, errorJson, withUser } from '@/server/http/respond';
import { SESSION_COOKIE } from '@/server/auth/session';

describe('respond helpers', () => {
  it('json sets status and body', async () => {
    const res = json({ a: 1 }, { status: 201 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ a: 1 });
  });

  it('errorJson wraps code/message', async () => {
    const res = errorJson(404, 'NOT_FOUND', 'nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'nope' } });
  });

  it('withUser returns 401 when no cookie', async () => {
    const res = await withUser(new Request('http://x/'), async () => json({ ok: true }));
    expect(res.status).toBe(401);
  });

  it('withUser passes userId to fn when cookie present', async () => {
    const req = new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=u1` } });
    const res = await withUser(req, async (userId) => json({ userId }));
    expect(await res.json()).toEqual({ userId: 'u1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/http-respond.test.ts`
Expected: FAIL — cannot find module `@/server/http/respond`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/http/respond.ts
import { requireUser } from '@/server/auth/requireUser';

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function errorJson(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function withUser(
  req: Request,
  fn: (userId: string) => Promise<Response>,
): Promise<Response> {
  let userId: string;
  try {
    userId = requireUser(req).userId;
  } catch {
    return errorJson(401, 'UNAUTHORIZED', 'Sign in required');
  }
  return fn(userId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/http-respond.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/http/respond.ts tests/unit/http-respond.test.ts
git commit -m "feat: add HTTP response helpers (json/errorJson/withUser)"
```

---

### Task 2: SSE event encoding + stream

**Files:**
- Create: `src/server/sse/events.ts`
- Test: `tests/unit/sse-events.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { encodeSseEvent, sseResponse } from '@/server/sse/events';

describe('SSE', () => {
  it('encodes event + JSON data with blank-line terminator', () => {
    expect(encodeSseEvent({ event: 'token', data: { delta: 'hi' } }))
      .toBe('event: token\ndata: {"delta":"hi"}\n\n');
  });

  it('sseResponse streams encoded events and sets content-type', async () => {
    async function* gen() {
      yield { event: 'a', data: { n: 1 } };
      yield { event: 'done', data: {} };
    }
    const res = sseResponse(gen());
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('event: a\ndata: {"n":1}\n\n');
    expect(text).toContain('event: done\ndata: {}\n\n');
  });

  it('sseResponse emits an error event if the generator throws', async () => {
    async function* gen() {
      yield { event: 'a', data: {} };
      throw new Error('boom');
    }
    const text = await sseResponse(gen()).text();
    expect(text).toContain('event: error');
    expect(text).toContain('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/sse-events.test.ts`
Expected: FAIL — cannot find module `@/server/sse/events`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/sse/events.ts
export interface SseEvent {
  event: string;
  data: unknown;
}

export function encodeSseEvent(e: SseEvent): string {
  return `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
}

export function sseResponse(gen: AsyncIterable<SseEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const e of gen) controller.enqueue(encoder.encode(encodeSseEvent(e)));
      } catch (err) {
        controller.enqueue(
          encoder.encode(encodeSseEvent({ event: 'error', data: { code: 'STREAM_ERROR', message: String(err) } })),
        );
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/sse-events.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/sse/events.ts tests/unit/sse-events.test.ts
git commit -m "feat: add SSE event encoding + stream response helper"
```

---

### Task 3: Language detection

**Files:**
- Create: `src/server/text/langDetect.ts`
- Test: `tests/unit/lang-detect.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { detectLang } from '@/server/text/langDetect';

describe('detectLang', () => {
  it('detects English', () => expect(detectLang('good morning')).toBe('en'));
  it('detects Chinese', () => expect(detectLang('早上好')).toBe('zh'));
  it('detects mixed', () => expect(detectLang('我想要 a latte')).toBe('mixed'));
  it('treats punctuation/numbers only as en', () => expect(detectLang('123 ...')).toBe('en'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/lang-detect.test.ts`
Expected: FAIL — cannot find module `@/server/text/langDetect`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/text/langDetect.ts
export function detectLang(text: string): 'en' | 'zh' | 'mixed' {
  const hasCjk = /[一-鿿]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasCjk && hasLatin) return 'mixed';
  if (hasCjk) return 'zh';
  return 'en';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/lang-detect.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/text/langDetect.ts tests/unit/lang-detect.test.ts
git commit -m "feat: add language detection (en/zh/mixed)"
```

---

### Task 4: Streak computation

**Files:**
- Create: `src/server/users/streak.ts`
- Test: `tests/unit/streak.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computeStreak } from '@/server/users/streak';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

describe('computeStreak', () => {
  it('counts consecutive days ending today', () => {
    const now = at(2026, 5, 25);
    const r = computeStreak([at(2026, 5, 25), at(2026, 5, 24), at(2026, 5, 23)], now);
    expect(r.days).toBe(3);
    expect(r.weekCount).toBe(3);
    expect(r.perDay).toEqual([0, 0, 0, 0, 1, 1, 1]); // index 6 = today
  });

  it('allows a streak that ends yesterday (today not yet active)', () => {
    const now = at(2026, 5, 25);
    const r = computeStreak([at(2026, 5, 24), at(2026, 5, 23)], now);
    expect(r.days).toBe(2);
  });

  it('breaks the streak on a gap and dedups multiple events per day', () => {
    const now = at(2026, 5, 25);
    const r = computeStreak([at(2026, 5, 25), at(2026, 5, 25), at(2026, 5, 22)], now);
    expect(r.days).toBe(1);
    expect(r.weekCount).toBe(2); // 25th and 22nd are distinct active days
  });

  it('returns zeros for no activity', () => {
    expect(computeStreak([], at(2026, 5, 25))).toEqual({ days: 0, weekCount: 0, perDay: [0, 0, 0, 0, 0, 0, 0] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/unit/streak.test.ts`
Expected: FAIL — cannot find module `@/server/users/streak`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/users/streak.ts
export interface StreakResult {
  days: number;
  weekCount: number;
  perDay: number[]; // length 7; index 0 = 6 days ago, index 6 = today
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function computeStreak(dates: Date[], now: Date = new Date()): StreakResult {
  const active = new Set(dates.map(dayKey));

  const perDay: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    perDay.push(active.has(dayKey(d)) ? 1 : 0);
  }
  const weekCount = perDay.reduce((a, b) => a + b, 0);

  let days = 0;
  const cursor = new Date(now);
  if (!active.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1); // allow streak through yesterday
  while (active.has(dayKey(cursor))) {
    days++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { days, weekCount, perDay };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/unit/streak.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/users/streak.ts tests/unit/streak.test.ts
git commit -m "feat: add 7-day streak computation"
```

---

### Task 5: Account service (register/login)

**Files:**
- Create: `src/server/auth/accounts.ts`
- Test: `tests/integration/accounts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { registerAccount, loginAccount, UsernameTakenError } from '@/server/auth/accounts';

const prisma = new PrismaClient();
const U = '__w2_accounts_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('accounts', () => {
  it('registers a user with default profile + settings and logs in', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const { userId } = await registerAccount(prisma, { username: U, password: 'pw' });
    expect(userId).toBeTruthy();

    const withRels = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true, settings: true } });
    expect(withRels?.profile).not.toBeNull();
    expect(withRels?.settings?.memoryStrategy).toBe('hybrid');

    const ok = await loginAccount(prisma, { username: U, password: 'pw' });
    expect(ok).toEqual({ userId });
  });

  it('rejects duplicate usernames', async () => {
    await expect(registerAccount(prisma, { username: U, password: 'other' })).rejects.toBeInstanceOf(UsernameTakenError);
  });

  it('returns null on wrong password', async () => {
    expect(await loginAccount(prisma, { username: U, password: 'WRONG' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/accounts.test.ts`
Expected: FAIL — cannot find module `@/server/auth/accounts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/auth/accounts.ts
import type { PrismaClient } from '@prisma/client';

export class UsernameTakenError extends Error {
  constructor() {
    super('Username already taken');
    this.name = 'UsernameTakenError';
  }
}

export async function registerAccount(
  prisma: PrismaClient,
  input: { username: string; password: string },
): Promise<{ userId: string }> {
  const existing = await prisma.user.findUnique({ where: { username: input.username } });
  if (existing) throw new UsernameTakenError();
  const user = await prisma.user.create({
    data: {
      username: input.username,
      password: input.password, // plaintext — local demo only (spec §四)
      profile: { create: {} },
      settings: { create: {} },
    },
  });
  return { userId: user.id };
}

export async function loginAccount(
  prisma: PrismaClient,
  input: { username: string; password: string },
): Promise<{ userId: string } | null> {
  const user = await prisma.user.findFirst({
    where: { username: input.username, password: input.password },
  });
  return user ? { userId: user.id } : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/accounts.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/accounts.ts tests/integration/accounts.test.ts
git commit -m "feat: add account service (register/login, plaintext per spec)"
```

---

### Task 6: Auth routes — register + login

**Files:**
- Create: `src/app/api/auth/register/route.ts`
- Create: `src/app/api/auth/login/route.ts`
- Test: `tests/integration/auth-routes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w2_authroutes_user__';
const body = (obj: unknown) => new Request('http://x/', { method: 'POST', body: JSON.stringify(obj) });

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('auth routes', () => {
  it('register sets a session cookie and returns userId', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const res = await register(body({ username: U, password: 'pw' }));
    expect(res.status).toBe(200);
    const { userId } = await res.json();
    expect(userId).toBeTruthy();
    expect(res.headers.get('Set-Cookie')).toContain(`${SESSION_COOKIE}=${userId}`);
  });

  it('register rejects a duplicate username with 409', async () => {
    const res = await register(body({ username: U, password: 'pw' }));
    expect(res.status).toBe(409);
  });

  it('register 400s on a missing field', async () => {
    expect((await register(body({ username: U }))).status).toBe(400);
  });

  it('login returns userId + cookie on correct password, 401 otherwise', async () => {
    const ok = await login(body({ username: U, password: 'pw' }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Set-Cookie')).toContain(SESSION_COOKIE);
    expect((await login(body({ username: U, password: 'no' }))).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/auth-routes.test.ts`
Expected: FAIL — cannot find the route modules.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/auth/register/route.ts
import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { registerAccount, UsernameTakenError } from '@/server/auth/accounts';
import { serializeSessionCookie } from '@/server/auth/session';
import { errorJson } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

const Body = z.object({ username: z.string().min(1), password: z.string().min(1) });

export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'username and password required');
  try {
    const { userId } = await registerAccount(prisma, parsed.data);
    return Response.json({ userId }, { headers: { 'Set-Cookie': serializeSessionCookie(userId) } });
  } catch (e) {
    if (e instanceof UsernameTakenError) return errorJson(409, 'USERNAME_TAKEN', 'Username already taken');
    throw e;
  }
}
```

```ts
// src/app/api/auth/login/route.ts
import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { loginAccount } from '@/server/auth/accounts';
import { serializeSessionCookie } from '@/server/auth/session';
import { errorJson } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

const Body = z.object({ username: z.string().min(1), password: z.string().min(1) });

export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'username and password required');
  const result = await loginAccount(prisma, parsed.data);
  if (!result) return errorJson(401, 'INVALID_CREDENTIALS', 'Wrong username or password');
  return Response.json({ userId: result.userId }, { headers: { 'Set-Cookie': serializeSessionCookie(result.userId) } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/auth-routes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/register/route.ts src/app/api/auth/login/route.ts tests/integration/auth-routes.test.ts
git commit -m "feat: add register + login routes (session cookie)"
```

---

### Task 7: Auth routes — logout + me

**Files:**
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/auth/me/route.ts`
- Test: `tests/integration/auth-me.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me } from '@/app/api/auth/me/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w2_me_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const withUid = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('auth me + logout', () => {
  it('logout clears the cookie', async () => {
    const res = await logout();
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('me 401s without a cookie', async () => {
    expect((await me(new Request('http://x/'))).status).toBe(401);
  });

  it('me returns user, streak and totals', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.activityEvent.create({ data: { userId: user.id, type: 'message_sent' } });

    const res = await me(withUid(user.id));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.username).toBe(U);
    expect(data.streak.weekCount).toBe(1);
    expect(data.totals).toEqual({ conversations: 0, scenarios: 0, memories: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/auth-me.test.ts`
Expected: FAIL — cannot find the route modules.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/auth/logout/route.ts
import { clearSessionCookie } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
}
```

```ts
// src/app/api/auth/me/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { computeStreak } from '@/server/users/streak';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return errorJson(401, 'UNAUTHORIZED', 'Sign in required');

    const events = await prisma.activityEvent.findMany({
      where: { userId, type: 'message_sent' },
      select: { createdAt: true },
    });
    const streak = computeStreak(events.map((e) => e.createdAt));

    const [conversations, scenarios, memories] = await Promise.all([
      prisma.message.count({ where: { userId } }),
      prisma.scenarioSession.count({ where: { userId, status: 'completed' } }),
      prisma.memory.count({ where: { userId } }),
    ]);

    return json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        language: user.language,
        targetLang: user.targetLang,
      },
      streak: { days: streak.days, weekCount: streak.weekCount },
      totals: { conversations, scenarios, memories },
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/auth-me.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/logout/route.ts src/app/api/auth/me/route.ts tests/integration/auth-me.test.ts
git commit -m "feat: add logout + me routes (streak + totals)"
```

---

### Task 8: Profile routes (GET + PUT)

**Files:**
- Create: `src/app/api/profile/route.ts`
- Test: `tests/integration/profile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET, PUT } from '@/app/api/profile/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w2_profile_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const get = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });
const put = (uid: string, obj: unknown) =>
  new Request('http://x/', { method: 'PUT', headers: { cookie: `${SESSION_COOKIE}=${uid}` }, body: JSON.stringify(obj) });

describe('profile routes', () => {
  it('GET 401s without a cookie', async () => {
    expect((await GET(new Request('http://x/'))).status).toBe(401);
  });

  it('PUT upserts profile + language, GET reads it back', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });

    const putRes = await PUT(put(user.id, { role: 'Student', goal: 'work', interests: ['coffee', 'music'], language: 'zh-CN' }));
    expect((await putRes.json()).ok).toBe(true);

    const data = await (await GET(get(user.id))).json();
    expect(data).toEqual({ role: 'Student', goal: 'work', interests: ['coffee', 'music'], language: 'zh-CN' });
  });

  it('GET returns defaults when no profile exists', async () => {
    const user = await prisma.user.create({ data: { username: U + '2', password: 'pw' } });
    const data = await (await GET(get(user.id))).json();
    expect(data).toEqual({ role: null, goal: null, interests: [], language: 'zh-CN' });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/profile.test.ts`
Expected: FAIL — cannot find `@/app/api/profile/route`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/profile/route.ts
import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    const p = user?.profile;
    return json({
      role: p?.role ?? null,
      goal: p?.goal ?? null,
      interests: p ? (JSON.parse(p.interests) as string[]) : [],
      language: user?.language ?? 'zh-CN',
    });
  });
}

const PutBody = z.object({
  role: z.string().nullish(),
  goal: z.string().nullish(),
  interests: z.array(z.string()).default([]),
  language: z.string().optional(),
});

export async function PUT(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const parsed = PutBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'invalid profile payload');
    const { role, goal, interests, language } = parsed.data;
    const interestsJson = JSON.stringify(interests);
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: { userId, role: role ?? null, goal: goal ?? null, interests: interestsJson },
      update: { role: role ?? null, goal: goal ?? null, interests: interestsJson },
    });
    if (language) await prisma.user.update({ where: { id: userId }, data: { language } });
    return json({
      ok: true,
      profile: { role: profile.role, goal: profile.goal, interests: JSON.parse(profile.interests) as string[] },
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/profile.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/profile/route.ts tests/integration/profile.test.ts
git commit -m "feat: add profile GET/PUT (onboarding writeback)"
```

---

### Task 9: Onboarding complete route

**Files:**
- Create: `src/app/api/onboarding/complete/route.ts`
- Test: `tests/integration/onboarding.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST } from '@/app/api/onboarding/complete/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w2_onboarding_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const post = (uid: string) =>
  new Request('http://x/', { method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${uid}` }, body: '{}' });

describe('onboarding complete', () => {
  it('inits Lily relationship + thread + intro message, idempotently', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });

    const first = await (await POST(post(user.id))).json();
    expect(first.npc).toBe('lily');
    expect(first.firstMessageId).toBeTruthy();

    const rel = await prisma.relationship.findUnique({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel?.stage).toBe('acquaintance');
    const intro = await prisma.message.findUnique({ where: { id: first.firstMessageId } });
    expect(intro?.role).toBe('npc');
    expect(intro?.text.length).toBeGreaterThan(0);

    // calling again does not duplicate the intro message
    const second = await (await POST(post(user.id))).json();
    expect(second.firstMessageId).toBe(first.firstMessageId);
    const count = await prisma.message.count({ where: { thread: { userId: user.id, npcId: 'lily' } } });
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/onboarding.test.ts`
Expected: FAIL — cannot find `@/app/api/onboarding/complete/route`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/onboarding/complete/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

const LILY = 'lily';

export async function POST(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const lily = await prisma.npc.findUnique({ where: { id: LILY } });
    if (!lily) return errorJson(500, 'SEED_MISSING', 'Lily NPC is not seeded');

    await prisma.relationship.upsert({
      where: { userId_npcId: { userId, npcId: LILY } },
      create: { userId, npcId: LILY },
      update: {},
    });
    const thread = await prisma.thread.upsert({
      where: { userId_npcId: { userId, npcId: LILY } },
      create: { userId, npcId: LILY },
      update: {},
    });

    const existing = await prisma.message.findFirst({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return json({ npc: LILY, firstMessageId: existing.id });

    const intro = await prisma.message.create({
      data: { threadId: thread.id, userId: null, role: 'npc', text: lily.introMessage },
    });
    await prisma.thread.update({ where: { id: thread.id }, data: { lastMsgAt: intro.createdAt } });
    return json({ npc: LILY, firstMessageId: intro.id });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/onboarding.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/onboarding/complete/route.ts tests/integration/onboarding.test.ts
git commit -m "feat: add onboarding/complete (init Lily relationship + intro)"
```

---

### Task 10: NPC list + detail routes

**Files:**
- Create: `src/app/api/npcs/route.ts`
- Create: `src/app/api/npcs/[id]/route.ts`
- Test: `tests/integration/npcs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET as list } from '@/app/api/npcs/route';
import { GET as detail } from '@/app/api/npcs/[id]/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w2_npcs_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const req = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('npc routes', () => {
  it('list returns all seeded NPCs with this user relationship + last message', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.message.create({ data: { threadId: thread.id, userId: null, role: 'npc', text: 'last one' } });

    const data = await (await list(req(user.id))).json();
    const lily = data.find((n: { id: string }) => n.id === 'lily');
    expect(lily.relationship).toBe('friend');
    expect(lily.stageValue).toBe(2);
    expect(lily.lastMessage).toBe('last one');
    // an NPC the user has no relationship with still appears with defaults
    const emma = data.find((n: { id: string }) => n.id === 'emma');
    expect(emma.relationship).toBe('acquaintance');
    expect(emma.lastMessage).toBeNull();
  });

  it('detail returns persona panel; 404 for unknown id', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const res = await detail(req(user.id), { params: { id: 'lily' } });
    const d = await res.json();
    expect(d.name).toBe('Lily');
    expect(d.languageProfile.primary).toBe('en');
    expect(Array.isArray(d.knownFacts)).toBe(true);
    expect((await detail(req(user.id), { params: { id: 'nope' } })).status).toBe(404);
  });

  it('list 401s without a cookie', async () => {
    expect((await list(new Request('http://x/'))).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/npcs.test.ts`
Expected: FAIL — cannot find the npc route modules.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/npcs/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const npcs = await prisma.npc.findMany({ orderBy: { id: 'asc' } });
    const rels = await prisma.relationship.findMany({ where: { userId } });
    const relByNpc = new Map(rels.map((r) => [r.npcId, r]));
    const threads = await prisma.thread.findMany({
      where: { userId },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const threadByNpc = new Map(threads.map((t) => [t.npcId, t]));

    const out = npcs.map((n) => {
      const rel = relByNpc.get(n.id);
      const last = threadByNpc.get(n.id)?.messages[0];
      return {
        id: n.id,
        name: n.name,
        avatar: { glyph: n.avatarGlyph, bg: n.avatarBg, ink: n.avatarInk },
        status: rel ? 'active' : 'new',
        relationship: rel?.stage ?? 'acquaintance',
        stageValue: rel?.stageValue ?? 1,
        lastMessage: last?.text ?? null,
        lastTime: last?.createdAt ?? null,
        hasSomething: false, // W3: set when there are undismissed memories
      };
    });
    return json(out);
  });
}
```

```ts
// src/app/api/npcs/[id]/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const n = await prisma.npc.findUnique({ where: { id: params.id } });
    if (!n) return errorJson(404, 'NOT_FOUND', 'No such NPC');

    const rel = await prisma.relationship.findUnique({ where: { userId_npcId: { userId, npcId: n.id } } });
    const messages = await prisma.message.count({ where: { thread: { userId, npcId: n.id } } });

    return json({
      id: n.id,
      name: n.name,
      persona: n.shortBio,
      languageProfile: JSON.parse(n.languageProfile),
      relationship: rel?.stage ?? 'acquaintance',
      knownFacts: [], // W3: Memory.recall()
      chatStats: { messages, conversationCount: rel?.conversationCount ?? 0 },
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/npcs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/npcs/route.ts "src/app/api/npcs/[id]/route.ts" tests/integration/npcs.test.ts
git commit -m "feat: add NPC list + detail routes"
```

---

### Task 11: Thread message history (GET) + clear (DELETE)

**Files:**
- Create: `src/server/chat/threads.ts`
- Create: `src/app/api/threads/[npcId]/messages/route.ts`
- Create: `src/app/api/threads/[npcId]/route.ts`
- Test: `tests/integration/thread-history.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET as history } from '@/app/api/threads/[npcId]/messages/route';
import { DELETE as clearThread } from '@/app/api/threads/[npcId]/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w2_history_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const get = (uid: string, qs = '') => new Request('http://x/' + qs, { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });
const del = (uid: string) => new Request('http://x/', { method: 'DELETE', headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('thread history', () => {
  it('returns empty for a thread that does not exist yet', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const data = await (await history(get(user.id), { params: { npcId: 'lily' } })).json();
    expect(data).toEqual({ messages: [], hasMore: false });
  });

  it('paginates oldest-first with hasMore + before cursor', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    for (let i = 0; i < 5; i++) {
      await prisma.message.create({
        data: { threadId: thread.id, userId: i % 2 === 0 ? user.id : null, role: i % 2 === 0 ? 'user' : 'npc', text: `m${i}`, createdAt: new Date(Date.now() + i * 1000) },
      });
    }
    const page1 = await (await history(get(user.id, '?limit=3'), { params: { npcId: 'lily' } })).json();
    expect(page1.messages.map((m: { text: string }) => m.text)).toEqual(['m2', 'm3', 'm4']);
    expect(page1.hasMore).toBe(true);
    expect(page1.messages[0].from).toBe('user');

    const cursor = page1.messages[0].id;
    const page2 = await (await history(get(user.id, `?limit=3&before=${cursor}`), { params: { npcId: 'lily' } })).json();
    expect(page2.messages.map((m: { text: string }) => m.text)).toEqual(['m0', 'm1']);
    expect(page2.hasMore).toBe(false);
  });

  it('DELETE clears the thread messages', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    expect((await (await clearThread(del(user.id), { params: { npcId: 'lily' } })).json()).ok).toBe(true);
    const remaining = await prisma.message.count({ where: { thread: { userId: user.id, npcId: 'lily' } } });
    expect(remaining).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/thread-history.test.ts`
Expected: FAIL — cannot find the thread route modules.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/chat/threads.ts
export interface MessageRow {
  id: string;
  role: string;
  text: string;
  userId: string | null;
  correction: string | null;
  langDetect: string | null;
  createdAt: Date;
}

export function mapMessageToApi(m: MessageRow) {
  return {
    id: m.id,
    role: m.role,
    text: m.text,
    from: m.userId ? 'user' : 'npc',
    correction: m.correction ? JSON.parse(m.correction) : null,
    lang: m.langDetect,
    createdAt: m.createdAt,
  };
}
```

```ts
// src/app/api/threads/[npcId]/messages/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';
import { mapMessageToApi } from '@/server/chat/threads';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { npcId: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const url = new URL(req.url);
    const before = url.searchParams.get('before');
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 100);

    const thread = await prisma.thread.findUnique({ where: { userId_npcId: { userId, npcId: params.npcId } } });
    if (!thread) return json({ messages: [], hasMore: false });

    let beforeCreatedAt: Date | undefined;
    if (before) {
      const b = await prisma.message.findUnique({ where: { id: before } });
      beforeCreatedAt = b?.createdAt;
    }

    const rows = await prisma.message.findMany({
      where: { threadId: thread.id, ...(beforeCreatedAt ? { createdAt: { lt: beforeCreatedAt } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();
    return json({ messages: page.map(mapMessageToApi), hasMore });
  });
}
```

```ts
// src/app/api/threads/[npcId]/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

export async function DELETE(req: Request, { params }: { params: { npcId: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const thread = await prisma.thread.findUnique({ where: { userId_npcId: { userId, npcId: params.npcId } } });
    if (thread) {
      await prisma.message.deleteMany({ where: { threadId: thread.id } });
      await prisma.thread.update({ where: { id: thread.id }, data: { lastMsgAt: null } });
    }
    return json({ ok: true });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/thread-history.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/chat/threads.ts "src/app/api/threads/[npcId]/messages/route.ts" "src/app/api/threads/[npcId]/route.ts" tests/integration/thread-history.test.ts
git commit -m "feat: add thread history (paginated) + clear-thread routes"
```

---

### Task 12: Chat orchestration (`streamChat`)

**Files:**
- Create: `src/server/chat/streamChat.ts`
- Test: `tests/integration/stream-chat.test.ts`

This is the core W2 deliverable: an async generator that saves the user message, streams the NPC reply token-by-token from a (mocked-in-tests) Ollama, persists the NPC message, and updates relationship/activity bookkeeping. It uses only the **recent-message buffer** for context (memory recall arrives in W3).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OllamaClient } from '@/server/llm/ollama';
import { streamChat } from '@/server/chat/streamChat';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const U = '__w2_streamchat_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

function ndjsonResponse(lines: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(l + '\n'));
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe('streamChat', () => {
  it('saves user + npc messages and emits the W2 event sequence', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });

    const fetchImpl = vi.fn().mockResolvedValue(
      ndjsonResponse([
        JSON.stringify({ message: { content: 'hi ' }, done: false }),
        JSON.stringify({ message: { content: 'there' }, done: true }),
      ]),
    );
    const ollama = new OllamaClient({ fetchImpl });

    const events: SseEvent[] = [];
    for await (const e of streamChat({ prisma, ollama, userId: user.id, npcId: 'lily', text: '早上好 morning' })) {
      events.push(e);
    }

    const names = events.map((e) => e.event);
    expect(names[0]).toBe('user_message_saved');
    expect(names).toContain('typing_start');
    expect(names.filter((n) => n === 'token').length).toBe(2);
    expect(names).toContain('message_complete');
    expect(names[names.length - 1]).toBe('done');

    const complete = events.find((e) => e.event === 'message_complete')!.data as { fullText: string };
    expect(complete.fullText).toBe('hi there');

    // persisted: 1 user msg (lang 'mixed') + 1 npc msg
    const msgs = await prisma.message.findMany({ where: { thread: { userId: user.id, npcId: 'lily' } }, orderBy: { createdAt: 'asc' } });
    expect(msgs.map((m) => m.role)).toEqual(['user', 'npc']);
    expect(msgs[0].langDetect).toBe('mixed');
    expect(msgs[1].text).toBe('hi there');

    // bookkeeping
    const rel = await prisma.relationship.findUnique({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel?.conversationCount).toBe(1);
    expect(rel?.relationshipPoints).toBe(1);
    const act = await prisma.activityEvent.count({ where: { userId: user.id, type: 'message_sent' } });
    expect(act).toBe(1);
  });

  it('emits an error event (not a throw) when the model is unreachable', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const ollama = new OllamaClient({ fetchImpl });

    const events: SseEvent[] = [];
    for await (const e of streamChat({ prisma, ollama, userId: user.id, npcId: 'lily', text: 'hello' })) {
      events.push(e);
    }
    const names = events.map((e) => e.event);
    expect(names).toContain('user_message_saved'); // user msg still saved
    expect(names).toContain('error');
    expect(names[names.length - 1]).toBe('done');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/stream-chat.test.ts`
Expected: FAIL — cannot find module `@/server/chat/streamChat`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/server/chat/streamChat.ts
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient, ChatMessage } from '@/server/llm/ollama';
import type { SseEvent } from '@/server/sse/events';
import { buildSystemPrompt } from '@/server/prompt/builder';
import { detectLang } from '@/server/text/langDetect';

const RECENT_BUFFER = 10;

export interface StreamChatDeps {
  prisma: PrismaClient;
  ollama: OllamaClient;
  userId: string;
  npcId: string;
  text: string;
  lang?: string;
}

export async function* streamChat(deps: StreamChatDeps): AsyncGenerator<SseEvent> {
  const { prisma, ollama, userId, npcId, text } = deps;

  const npc = await prisma.npc.findUnique({ where: { id: npcId } });
  if (!npc) {
    yield { event: 'error', data: { code: 'NPC_NOT_FOUND', message: npcId } };
    yield { event: 'done', data: {} };
    return;
  }

  // get-or-create thread + relationship (scoped to this user)
  const thread = await prisma.thread.upsert({
    where: { userId_npcId: { userId, npcId } },
    create: { userId, npcId },
    update: {},
  });
  const rel = await prisma.relationship.upsert({
    where: { userId_npcId: { userId, npcId } },
    create: { userId, npcId },
    update: {},
  });

  // 1. persist the user message
  const lang = deps.lang ?? detectLang(text);
  const userMsg = await prisma.message.create({
    data: { threadId: thread.id, userId, role: 'user', text, langDetect: lang },
  });
  yield { event: 'user_message_saved', data: { messageId: userMsg.id, createdAt: userMsg.createdAt } };
  yield { event: 'typing_start', data: { npcId } };

  // 2. build the system prompt + recent buffer (memory recall arrives in W3)
  const [profile, user, recent] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.message.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: 'desc' }, take: RECENT_BUFFER }),
  ]);
  const history = recent.reverse();

  const systemPrompt = buildSystemPrompt({
    npc: {
      name: npc.name,
      personaPrompt: npc.personaPrompt,
      languageProfile: JSON.parse(npc.languageProfile),
    },
    userProfile: profile
      ? { role: profile.role, goal: profile.goal, interests: JSON.parse(profile.interests) }
      : undefined,
    relationshipStage: rel.stage as 'acquaintance' | 'friend' | 'close',
    userLanguage: user?.language ?? 'zh-CN',
    mode: 'casual',
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m): ChatMessage => ({ role: m.userId ? 'user' : 'assistant', content: m.text })),
  ];

  // 3. stream the reply
  let full = '';
  try {
    for await (const tok of ollama.chat(messages)) {
      full += tok;
      yield { event: 'token', data: { delta: tok } };
    }
  } catch (e) {
    yield { event: 'error', data: { code: 'LLM_UNAVAILABLE', message: String(e) } };
    yield { event: 'typing_end', data: { npcId } };
    yield { event: 'done', data: {} };
    return;
  }

  // 4. persist the NPC reply
  const npcMsg = await prisma.message.create({
    data: { threadId: thread.id, userId: null, role: 'npc', text: full },
  });
  yield { event: 'typing_end', data: { npcId } };
  yield { event: 'message_complete', data: { messageId: npcMsg.id, fullText: full } };

  // 5. bookkeeping (stage-up evaluation + achievements arrive in W5)
  await prisma.thread.update({ where: { id: thread.id }, data: { lastMsgAt: npcMsg.createdAt } });
  await prisma.relationship.update({
    where: { id: rel.id },
    data: {
      conversationCount: { increment: 1 },
      relationshipPoints: { increment: 1 },
      lastInteractionAt: new Date(),
    },
  });
  await prisma.activityEvent.create({
    data: { userId, type: 'message_sent', payload: JSON.stringify({ npcId }) },
  });

  yield { event: 'done', data: {} };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/stream-chat.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/chat/streamChat.ts tests/integration/stream-chat.test.ts
git commit -m "feat: add streamChat orchestration (SSE chat core)"
```

---

### Task 13: POST messages SSE route

**Files:**
- Modify: `src/app/api/threads/[npcId]/messages/route.ts` (add `POST` beside the existing `GET`)
- Test: `tests/integration/messages-post.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST } from '@/app/api/threads/[npcId]/messages/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w2_msgpost_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const post = (uid: string | null, obj: unknown) =>
  new Request('http://x/', {
    method: 'POST',
    headers: uid ? { cookie: `${SESSION_COOKIE}=${uid}` } : {},
    body: JSON.stringify(obj),
  });

describe('POST messages (SSE)', () => {
  it('401s without a cookie', async () => {
    expect((await POST(post(null, { text: 'hi' }), { params: { npcId: 'lily' } })).status).toBe(401);
  });

  it('400s on empty text', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    expect((await POST(post(user.id, { text: '' }), { params: { npcId: 'lily' } })).status).toBe(400);
  });

  it('returns an SSE stream that begins by saving the user message', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const res = await POST(post(user.id, { text: 'hello lily' }), { params: { npcId: 'lily' } });
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const text = await res.text(); // Ollama is down in tests → stream still saves user msg, then emits error + done
    expect(text).toContain('event: user_message_saved');
    expect(text).toContain('event: done');
    const saved = await prisma.message.count({ where: { thread: { userId: user.id, npcId: 'lily' }, role: 'user' } });
    expect(saved).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/messages-post.test.ts`
Expected: FAIL — `POST` is not exported from the messages route.

- [ ] **Step 3: Write minimal implementation**

Add the imports and `POST` handler to the **existing** `src/app/api/threads/[npcId]/messages/route.ts` (keep the `GET` from Task 11 unchanged):

```ts
// add these imports at the top of the file
import { z } from 'zod';
import { requireUser } from '@/server/auth/requireUser';
import { errorJson } from '@/server/http/respond';
import { sseResponse } from '@/server/sse/events';
import { streamChat } from '@/server/chat/streamChat';
import { OllamaClient } from '@/server/llm/ollama';
```

```ts
// add below the existing GET handler
const PostBody = z.object({ text: z.string().min(1), lang: z.string().optional() });

export async function POST(req: Request, { params }: { params: { npcId: string } }): Promise<Response> {
  let userId: string;
  try {
    userId = requireUser(req).userId;
  } catch {
    return errorJson(401, 'UNAUTHORIZED', 'Sign in required');
  }
  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'text is required');

  const gen = streamChat({
    prisma,
    ollama: new OllamaClient(),
    userId,
    npcId: params.npcId,
    text: parsed.data.text,
    lang: parsed.data.lang,
  });
  return sseResponse(gen);
}
```

> Note: the `GET` handler already imports `prisma`, `withUser`, `json`, and `mapMessageToApi` — do not re-import those.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/messages-post.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/threads/[npcId]/messages/route.ts" tests/integration/messages-post.test.ts
git commit -m "feat: add POST messages SSE chat endpoint"
```

---

### Task 14: Full-suite verification + live smoke

**Files:** none created — verification only.

- [ ] **Step 1: Run the entire test suite**

Run: `npm run test`
Expected: all tests green (21 from W1 + the new W2 tests). If any W1 test broke, STOP and fix before proceeding.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Live smoke against the dev server**

> Port 3000 is inside a Windows-reserved exclusion range on this machine (`netsh interface ipv4 show excludedportrange protocol=tcp` shows `2960–3059`), so use **3100**.

Start the server (separate terminal): `npx next dev -p 3100`

Then exercise the live flow (PowerShell):

```powershell
# register (captures the Set-Cookie jar)
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Uri http://localhost:3100/api/auth/register -Method Post -Body (@{username="smoke_$(Get-Random)"; password="pw"} | ConvertTo-Json) -ContentType 'application/json' -WebSession $s
Invoke-RestMethod -Uri http://localhost:3100/api/onboarding/complete -Method Post -Body '{}' -ContentType 'application/json' -WebSession $s
Invoke-RestMethod -Uri http://localhost:3100/api/npcs -WebSession $s
# SSE chat (curl streams the events; with Ollama down you still see user_message_saved + error + done)
curl.exe -N -b "pop_uid=$($s.Cookies.GetCookies('http://localhost:3100')['pop_uid'].Value)" -H "Content-Type: application/json" -d '{\"text\":\"hi lily\"}' http://localhost:3100/api/threads/lily/messages
```

Expected: register returns `{ userId }`; onboarding returns `{ npc: 'lily', firstMessageId }`; `/api/npcs` lists 3 NPCs; the SSE call streams `event: user_message_saved` (and, if Ollama + `qwen2.5:7b-instruct` are running, `token` deltas → `message_complete`).

- [ ] **Step 4: Stop the dev server** (Ctrl+C, or `Get-NetTCPConnection -LocalPort 3100 -State Listen | %{ Stop-Process -Id $_.OwningProcess -Force }`).

- [ ] **Step 5: Mark W2 done in the master plan**

Edit `docs/superpowers/plans/2026-05-25-backend-overall-plan.md` §3 — note W2 "Done when: Main App talks to Lily live" is satisfied.

```bash
git add docs/superpowers/plans/2026-05-25-backend-overall-plan.md
git commit -m "docs: mark W2 (chat + SSE) complete in master plan"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** §四 auth → Tasks 5–7; §五.1 → 6–7; §五.2 → 8–9; §五.3 → 10; §五.4 (GET history, POST SSE, DELETE) → 11–13; §六 SSE event names (W2 subset) → 2, 12; §十 workflow A (minus correction/recall/trigger, which are deferred by design) → 12. Deferred items are listed in **Scope** with their target phase.
- **Type consistency:** `SseEvent` (Task 2) is consumed by `streamChat` (12) and `sseResponse` (13). `withUser`/`json`/`errorJson` (Task 1) are used by every GET/PUT route. `mapMessageToApi` (11) matches the `Message` columns. `computeStreak` (4) return shape matches the `/api/auth/me` reader (7). `OllamaClient.chat` signature matches its W1 definition.
- **Placeholders:** none — every code step is complete; `knownFacts: []` / `hasSomething: false` are intentional W3 stubs, annotated inline.

> Version: v1 · 2026-05-25 · derived from spec v2 §四/§五.1–4/§六. Depends on W1 (merged).
