# Live NPC Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chat right panel and the scenario page reflect the conversation's real NPC (persona, languages, topics, relationship, per-NPC facts, memories) instead of hardcoded Lily.

**Architecture:** Reuse the existing `GET /api/npcs/:id` detail endpoint as the right-panel's data source — extend it (avatar, topicInterests, relationshipSince; per-NPC `knownFacts`) and wire `knownToNpcs` through the live fact pipeline + the demo seed. The web fetches `api.npcDetail(activeId)` + `api.memories(activeId)` on chat-open; the scenario page resolves its NPC from `api.npcs()`. The list endpoint and `NpcListItem` are unchanged.

**Tech Stack:** Hono + Prisma (SQLite) backend, `@popcorn/shared` zod/TS types, Vite/React web, Vitest, Playwright smoke.

**Conventions (read once):**
- **Branch:** all work on `feat/live-npc-identity` (already created; the spec is committed there). Never commit to `main`.
- **EOL:** plain `git` (`core.autocrlf=true`; CRLF warning expected). Never `-c core.autocrlf=false`.
- **Do not stage** `.claude/settings.local.json`, `docs/reports/memory-ablation.md`, `outputs/`.
- **Backend suite is non-deterministic unless Ollama is forced down** (a real slow Ollama runs on :11434 here). Always run it as `OLLAMA_BASE_URL=http://127.0.0.1:1 npm test`.
- Run workspace scripts with `-w <workspace>` from the repo root. Before any dev/smoke, clear stray node: PowerShell `Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force`.
- **No behavior change beyond the spec.** Date fields are `string | Date` (server emits `Date`, wire carries ISO).

---

## Task 1: Add the `NpcDetail` shared type

**Files:**
- Modify: `packages/shared/src/responses.ts`

- [ ] **Step 1: Add the interface.** Append to `packages/shared/src/responses.ts`:

```ts
// GET /api/npcs/:id (the NPC persona panel)
export interface NpcDetail {
  id: string;
  name: string;
  persona: string; // shortBio
  avatar: { glyph: string; bg: string; ink: string };
  languageProfile: { primary: string; occasional: string[]; register: string };
  topicInterests: string[];
  relationship: string; // stage
  relationshipSince: string | Date | null;
  knownFacts: string[]; // per-NPC, factToText-formatted
  chatStats: { messages: number; conversationCount: number };
}
```

- [ ] **Step 2: Typecheck shared.**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: exit 0 (no output).

- [ ] **Step 3: Commit.**

```bash
git add packages/shared/src/responses.ts
git commit -m "feat(shared): add NpcDetail response type"
```

---

## Task 2: Extend the detail endpoint + per-NPC `listFacts`

**Files:**
- Modify: `apps/api/src/server/memory/recall.ts`
- Modify: `apps/api/src/app/api/npcs/[id]/route.ts`
- Test: `apps/api/tests/integration/npc-known-facts.test.ts` (update to per-NPC)
- Test: `apps/api/tests/integration/npcs.test.ts` (extend the detail assertions)

- [ ] **Step 1: Update the tests to the new contract (red first).**

In `apps/api/tests/integration/npc-known-facts.test.ts`, replace the body of the
`it('returns the user known facts as formatted strings', …)` so facts are scoped to
NPCs and a fact known only to another NPC is excluded:

```ts
  it('returns only the facts this NPC knows', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'has_pet', value: 'a cat named Mochi', knownToNpcs: JSON.stringify(['lily']) } });
    await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'works_as', value: 'engineer', knownToNpcs: JSON.stringify(['chen']) } });

    const d = await (await detail(req(user.id), { params: { id: 'lily' } })).json();
    expect(d.knownFacts).toContain('has pet: a cat named Mochi');
    expect(d.knownFacts).not.toContain('works as: engineer'); // chen-only fact absent for lily
  });
```

In `apps/api/tests/integration/npcs.test.ts`, extend the existing
`it('detail returns persona panel; 404 for unknown id', …)` with the new fields
(add these assertions before the 404 check):

```ts
    expect(d.avatar.glyph).toBe('☕');
    expect(Array.isArray(d.topicInterests)).toBe(true);
    expect('relationshipSince' in d).toBe(true);
    expect(typeof d.chatStats.conversationCount).toBe('number');
```

- [ ] **Step 2: Run the two test files — expect FAIL.**

Run: `OLLAMA_BASE_URL=http://127.0.0.1:1 npm run test -w apps/api -- tests/integration/npc-known-facts.test.ts tests/integration/npcs.test.ts`
Expected: FAIL — `avatar`/`topicInterests` undefined; the chen-only fact still appears for lily.

- [ ] **Step 3: Make `listFacts` per-NPC.** In `apps/api/src/server/memory/recall.ts`, replace the `listFacts` function with:

```ts
// Flat list of a user's known facts for the "What X knows about you" panel.
// When npcId is given, only facts that NPC knows (knownToNpcs ∋ npcId).
export async function listFacts(
  prisma: PrismaClient,
  userId: string,
  limit = 8,
  npcId?: string,
): Promise<string[]> {
  const facts = await prisma.memoryFact.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  const scoped = npcId
    ? facts.filter((f) => (JSON.parse(f.knownToNpcs) as string[]).includes(npcId))
    : facts;
  return scoped.slice(0, limit).map((f) => factToText(f.predicate, f.value));
}
```

- [ ] **Step 4: Extend the detail handler + annotate it.** Replace the body of `apps/api/src/app/api/npcs/[id]/route.ts` with:

```ts
import { NpcDetail } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { listFacts } from '@/server/memory/recall';

export async function GET(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const n = await prisma.npc.findUnique({ where: { id: params.id } });
    if (!n) return errorJson(404, 'NOT_FOUND', 'No such NPC');

    const rel = await prisma.relationship.findUnique({ where: { userId_npcId: { userId, npcId: n.id } } });
    const messages = await prisma.message.count({ where: { thread: { userId, npcId: n.id } } });

    const out: NpcDetail = {
      id: n.id,
      name: n.name,
      persona: n.shortBio,
      avatar: { glyph: n.avatarGlyph, bg: n.avatarBg, ink: n.avatarInk },
      languageProfile: JSON.parse(n.languageProfile),
      topicInterests: JSON.parse(n.topicInterests),
      relationship: rel?.stage ?? 'acquaintance',
      relationshipSince: rel?.createdAt ?? null,
      knownFacts: await listFacts(prisma, userId, 8, n.id),
      chatStats: { messages, conversationCount: rel?.conversationCount ?? 0 },
    };
    return json(out);
  });
}
```

- [ ] **Step 5: Run the two test files — expect PASS.**

Run: `OLLAMA_BASE_URL=http://127.0.0.1:1 npm run test -w apps/api -- tests/integration/npc-known-facts.test.ts tests/integration/npcs.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck the API** (proves the `NpcDetail` annotation matches the handler).

Run: `npm run typecheck -w apps/api`
Expected: exit 0.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/server/memory/recall.ts "apps/api/src/app/api/npcs/[id]/route.ts" apps/api/tests/integration/npc-known-facts.test.ts apps/api/tests/integration/npcs.test.ts
git commit -m "feat(api): NPC detail returns avatar/topics/relationshipSince + per-NPC knownFacts"
```

---

## Task 3: Per-NPC fact scoping in the live pipeline

**Files:**
- Modify: `apps/api/src/server/memory/factExtract.ts`
- Modify: `apps/api/src/server/memory/postTurn.ts`
- Modify: `apps/api/src/server/chat/streamChat.ts`
- Test: `apps/api/tests/integration/fact-extract.test.ts` (add a scoping test)

- [ ] **Step 1: Add the failing scoping test.** Append this `it(...)` inside the `describe('extractAndStoreFacts', …)` block in `apps/api/tests/integration/fact-extract.test.ts`:

```ts
  it('scopes new facts to the chatting NPC and merges on re-learn', async () => {
    const U2 = '__w3_factscope_user__';
    await prisma.user.deleteMany({ where: { username: U2 } });
    const user = await prisma.user.create({ data: { username: U2, password: 'pw' } });
    const ollama = {
      chatJson: vi.fn().mockResolvedValue({ facts: [{ subject: 'user', predicate: 'likes', value: 'coffee', confidence: 0.9 }] }),
      embed: vi.fn().mockResolvedValue([0.1]),
    };

    await extractAndStoreFacts({ prisma, ollama, userId: user.id, text: 'I like coffee', npcId: 'lily' });
    let f = await prisma.memoryFact.findFirstOrThrow({ where: { userId: user.id, predicate: 'likes' } });
    expect(JSON.parse(f.knownToNpcs)).toEqual(['lily']);

    // same fact re-learned in a chat with chen → merge, no duplicate row
    const n = await extractAndStoreFacts({ prisma, ollama, userId: user.id, text: 'I like coffee', npcId: 'chen' });
    expect(n).toBe(0);
    f = await prisma.memoryFact.findFirstOrThrow({ where: { userId: user.id, predicate: 'likes' } });
    expect(JSON.parse(f.knownToNpcs).sort()).toEqual(['chen', 'lily']);
    expect(await prisma.memoryFact.count({ where: { userId: user.id, predicate: 'likes' } })).toBe(1);

    await prisma.user.deleteMany({ where: { username: U2 } });
  });
```

- [ ] **Step 2: Run it — expect FAIL.**

Run: `OLLAMA_BASE_URL=http://127.0.0.1:1 npm run test -w apps/api -- tests/integration/fact-extract.test.ts`
Expected: FAIL — `knownToNpcs` is `[]` (npcId ignored).

- [ ] **Step 3: Thread `npcId` into `extractAndStoreFacts`.** In `apps/api/src/server/memory/factExtract.ts`:

Add `npcId?: string;` to `FactExtractDeps`:

```ts
export interface FactExtractDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson' | 'embed'>;
  userId: string;
  text: string;
  sourceMsgId?: string;
  context?: string;
  npcId?: string;
}
```

Replace the dedup/create block (the `for (const f of out.facts) { … }` loop body) with:

```ts
  let stored = 0;
  for (const f of out.facts) {
    const existing = await deps.prisma.memoryFact.findFirst({
      where: { userId: deps.userId, predicate: f.predicate, value: f.value },
    });
    if (existing) {
      if (deps.npcId) {
        const known = JSON.parse(existing.knownToNpcs) as string[];
        if (!known.includes(deps.npcId)) {
          await deps.prisma.memoryFact.update({
            where: { id: existing.id },
            data: { knownToNpcs: JSON.stringify([...known, deps.npcId]) },
          });
        }
      }
      continue;
    }

    let embedding: string | null = null;
    try {
      embedding = JSON.stringify(await deps.ollama.embed(f.value));
    } catch (e) {
      console.error('[memory] embed failed for fact, storing without embedding', e);
      embedding = null;
    }

    await deps.prisma.memoryFact.create({
      data: {
        userId: deps.userId,
        subject: f.subject,
        predicate: f.predicate,
        value: f.value,
        confidence: f.confidence,
        embedding,
        sourceMsgId: deps.sourceMsgId ?? null,
        knownToNpcs: deps.npcId ? JSON.stringify([deps.npcId]) : '[]',
      },
    });
    stored++;
  }
  return stored;
```

- [ ] **Step 4: Pass `npcId` through `runPostTurnMemory`.** In `apps/api/src/server/memory/postTurn.ts`, add `npcId?: string;` to `PostTurnDeps` and forward it:

```ts
export interface PostTurnDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson' | 'embed'>;
  userId: string;
  threadId: string;
  userText: string;
  userMsgId: string;
  npcId?: string;
}
```

In the `extractAndStoreFacts({ … })` call, add `npcId: deps.npcId,`.

- [ ] **Step 5: Pass `npcId` from `streamChat`.** In `apps/api/src/server/chat/streamChat.ts`, the `runPostTurnMemory({ … })` call gains `npcId`:

```ts
  await runPostTurnMemory({ prisma, ollama, userId, threadId: thread.id, userText: text, userMsgId: userMsg.id, npcId });
```

- [ ] **Step 6: Run the fact tests — expect PASS (existing + new).**

Run: `OLLAMA_BASE_URL=http://127.0.0.1:1 npm run test -w apps/api -- tests/integration/fact-extract.test.ts`
Expected: PASS (the original two tests + the new scoping test).

- [ ] **Step 7: Typecheck the API.**

Run: `npm run typecheck -w apps/api`
Expected: exit 0.

- [ ] **Step 8: Commit.**

```bash
git add apps/api/src/server/memory/factExtract.ts apps/api/src/server/memory/postTurn.ts apps/api/src/server/chat/streamChat.ts apps/api/tests/integration/fact-extract.test.ts
git commit -m "feat(api): scope live-extracted facts to the chatting NPC (knownToNpcs)"
```

---

## Task 4: Differentiate the demo seed

**Files:**
- Modify: `apps/api/prisma/seedDemo.ts`
- Test: `apps/api/tests/integration/seed-demo-facts.test.ts` (create)

- [ ] **Step 1: Write the failing test.** Create `apps/api/tests/integration/seed-demo-facts.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { seedDemo } from '../../prisma/seedDemo';

const prisma = new PrismaClient();
const U = '__seeddemo_facts__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('seedDemo per-NPC facts', () => {
  it('gives different NPCs different known facts and a backdated relationship', async () => {
    const { userId } = await seedDemo(prisma, { username: U });
    const facts = await prisma.memoryFact.findMany({ where: { userId } });
    const knownTo = (npc: string) =>
      facts.filter((f) => (JSON.parse(f.knownToNpcs) as string[]).includes(npc)).map((f) => f.predicate);

    expect(knownTo('lily').length).toBeGreaterThan(0);
    expect(knownTo('chen').length).toBeGreaterThan(0);
    // Lily and Chen do not know the exact same set
    expect(knownTo('lily').sort()).not.toEqual(knownTo('chen').sort());

    const lilyRel = await prisma.relationship.findFirstOrThrow({ where: { userId, npcId: 'lily' } });
    expect(lilyRel.createdAt.getTime()).toBeLessThan(Date.now() - 7 * 86_400_000); // backdated > 1 week
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.**

Run: `OLLAMA_BASE_URL=http://127.0.0.1:1 npm run test -w apps/api -- tests/integration/seed-demo-facts.test.ts`
Expected: FAIL — all NPCs share the same facts; `createdAt` is ~now.

- [ ] **Step 3: Differentiate facts + backdate relationships in `apps/api/prisma/seedDemo.ts`.**

Replace the relationship-create `data: { … }` block (inside the `for (const … of stages)` loop) so it backdates `createdAt`:

```ts
    const ageDays = npcId === 'lily' ? 21 : npcId === 'chen' ? 14 : 7;
    const rel = await prisma.relationship.create({
      data: {
        userId: user.id, npcId, stage, stageValue,
        relationshipPoints: points,
        conversationCount: stageValue * 4,
        scenarioCount: npcId === 'lily' ? 1 : 0,
        createdAt: new Date(now - ageDays * DAY),
        lastInteractionAt: new Date(now - DAY),
      },
    });
```

Replace the facts block (the `const facts: [string, string][] = [ … ]; for (…) { … }` section) with per-NPC scoping:

```ts
  // predicate, value, and which NPCs know it
  const facts: { predicate: string; value: string; npcs: string[] }[] = [
    { predicate: 'likes', value: 'oat milk lattes', npcs: ['lily'] },
    { predicate: 'lives_near', value: "Murray's Bagels", npcs: ['lily'] },
    { predicate: 'works_as', value: 'software engineer', npcs: ['chen'] },
    { predicate: 'goal', value: 'grow into a tech lead', npcs: ['chen'] },
    { predicate: 'has_pet', value: 'a cat named Mochi', npcs: ['emma', 'lily'] },
    { predicate: 'likes', value: 'indie music', npcs: ['emma'] },
  ];
  for (const f of facts) {
    await prisma.memoryFact.create({
      data: { userId: user.id, predicate: f.predicate, value: f.value, knownToNpcs: JSON.stringify(f.npcs) },
    });
  }
```

Add a memory for Chen and Emma so their card isn't empty (after the existing
Lily `prisma.memory.create({…})`):

```ts
  await prisma.memory.create({
    data: { userId: user.id, title: 'Career-focused', body: 'You talk about projects and growing into a lead role.', npcId: 'chen', sourceType: 'chat_pattern' },
  });
  await prisma.memory.create({
    data: { userId: user.id, title: 'Cat parent', body: 'Mochi comes up a lot — clearly a cat person.', npcId: 'emma', sourceType: 'chat_pattern' },
  });
```

- [ ] **Step 4: Run it — expect PASS.**

Run: `OLLAMA_BASE_URL=http://127.0.0.1:1 npm run test -w apps/api -- tests/integration/seed-demo-facts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/prisma/seedDemo.ts apps/api/tests/integration/seed-demo-facts.test.ts
git commit -m "feat(seed): per-NPC demo facts + backdated relationships + Chen/Emma memories"
```

---

## Task 5: Web client methods

**Files:**
- Modify: `apps/web/src/api/client.ts`

- [ ] **Step 1: Add `NpcDetail` to the type import.** In `apps/web/src/api/client.ts`, add `NpcDetail` to the `import type { … } from '@popcorn/shared';` list (next to `MemoryItem`).

- [ ] **Step 2: Type `memories` with an optional npcId and add `npcDetail`.** Replace the `memories:` line and add `npcDetail:` next to it:

```ts
  npcDetail: (id: string): Promise<NpcDetail> => apiGet<NpcDetail>('/api/npcs/' + id),
  memories: (npcId?: string): Promise<MemoryItem[]> =>
    apiGet<MemoryItem[]>('/api/memories' + (npcId ? '?npcId=' + npcId : '')),
```

- [ ] **Step 3: Typecheck the web.**

Run: `npm run typecheck -w apps/web`
Expected: exit 0.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/api/client.ts
git commit -m "feat(web): client npcDetail(id) + memories(npcId?)"
```

---

## Task 6: `npcView` helper, delete `NPCS_WEB`, fix the scenario page

**Files:**
- Modify: `apps/web/src/components/shared.tsx`
- Modify: `apps/web/src/routes/Scenario.tsx`

- [ ] **Step 1: Add `npcView` and delete `NPCS_WEB`.** In `apps/web/src/components/shared.tsx`:

Add `NpcListItem` to the shared import: change
`import type { JourneySummaryResponse } from '@popcorn/shared';` to
`import type { JourneySummaryResponse, NpcListItem } from '@popcorn/shared';`.

Add this exported helper (near the top, after the imports):

```ts
// API NpcListItem → the flat view-model the avatar/header components consume.
export function npcView(item: NpcListItem) {
  return {
    id: item.id,
    name: item.name,
    avatarGlyph: item.avatar ? item.avatar.glyph : '?',
    avatarBg: item.avatar ? item.avatar.bg : 'var(--surface-2)',
    avatarInk: item.avatar ? item.avatar.ink : 'var(--ink)',
    relationship: item.relationship,
    stageValue: item.stageValue,
    status: item.status || '',
    lastPreview: item.lastMessage || '',
    time: item.lastTime ? new Date(item.lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
    hasSomething: !!item.hasSomething,
  };
}
```

Delete the entire `export const NPCS_WEB = [ … ];` array.

- [ ] **Step 2: Resolve the scenario NPC from the API.** In `apps/web/src/routes/Scenario.tsx`:

Update the shared import to drop `NPCS_WEB` and add `npcView`:
```ts
import {
  WebI,
  npcView,
  RELATIONSHIP_LABEL,
  WebAvatar,
  WebRelationshipDots,
  WebDock,
  WebConversationsRail,
} from '../components/shared';
```

Add an NPCs-by-id state + fetch. Near the other `useState`s in `Scenario()`:
```ts
  const [npcsById, setNpcsById] = useState<Record<string, ReturnType<typeof npcView>>>({});
```
In the mount `useEffect` (the one that calls `api.me().then(() => api.sessions())`), prepend an npcs fetch so it runs in parallel — immediately after `setLoading(true);` add:
```ts
    api.npcs().then((list) => {
      const map: Record<string, ReturnType<typeof npcView>> = {};
      for (const n of list) map[n.id] = npcView(n);
      setNpcsById(map);
    }).catch(() => {});
```

Derive the active scenario NPC (after `const effectiveSession = detailSession || session;`):
```ts
  const scenarioNpc =
    (effectiveSession && npcsById[effectiveSession.npcId]) ||
    { name: 'NPC', avatarGlyph: '?', avatarBg: 'var(--surface-2)', avatarInk: 'var(--ink)', status: '', stageValue: 1, relationship: 'acquaintance' };
```

Pass `npc={scenarioNpc}` to the header/messages. Concretely (these are the only
`NPCS_WEB[0]` readers in the file — the scenario `RightPanel*` components use
`session`/`hudState`, not the NPC):
  - `ScenChatHeader({ intense, session, hudState })` → `ScenChatHeader({ intense, session, hudState, npc })`; delete its `const npc = NPCS_WEB[0];` line; in the call site pass `npc={scenarioNpc}`. Replace the hardcoded `Lily` name uses with `{npc.name}` and the relationship/avatar reads with `npc`.
  - `ScenMessage({ msg, intense })` → `ScenMessage({ msg, intense, npc })`; delete its `const npc = NPCS_WEB[0];`; pass `npc={scenarioNpc}` at the two call sites.
  - The typing-indicator `<WebAvatar npc={NPCS_WEB[0]} size={26} />` → `<WebAvatar npc={scenarioNpc} size={26} />`.

(`WebConversationsRail activeId="lily"` may stay — it renders an empty rail in scenario view; leave it.)

- [ ] **Step 3: Typecheck the web** (also proves no `NPCS_WEB` references remain).

Run: `npm run typecheck -w apps/web`
Expected: exit 0.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/components/shared.tsx apps/web/src/routes/Scenario.tsx
git commit -m "feat(web): scenario page renders the session's real NPC; add npcView, drop NPCS_WEB"
```

---

## Task 7: Wire the App chat right panel

**Files:**
- Modify: `apps/web/src/routes/App.tsx`

- [ ] **Step 1: Imports + state.** In `apps/web/src/routes/App.tsx`:

Change the shared-type import to:
```ts
import type { ThreadMessage, NpcDetail, MemoryItem } from '@popcorn/shared';
```
Add `npcView` to the components import:
```ts
import {
  WebI,
  RELATIONSHIP_LABEL,
  WebAvatar,
  WebRelationshipDots,
  WebDock,
  WebConversationsRail,
  npcView,
} from '../components/shared';
```
Replace the `function mapNpc(a: NpcListItem) { … }` definition with nothing (deleted) and use `npcView` instead (Step 2). Inside `App()`, add state:
```ts
  const [detail, setDetail] = useState<NpcDetail | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
```

- [ ] **Step 2: Use `npcView` for the list + fetch detail/memories on chat-open.**

In the initial-load effect, change `const mapped = list.map(mapNpc);` to `const mapped = list.map(npcView);`.

Replace the "load thread when active NPC changes" effect with:
```ts
  useEffect(() => {
    if (!activeId) return;
    setOffer(null); setStreaming(''); setTyping(false); setDetail(null); setMemories([]);
    api.thread(activeId)
      .then((r) => setMessages((r.messages || []).map(mapMsg)))
      .catch(() => setMessages([]));
    api.npcDetail(activeId).then(setDetail).catch(() => setDetail(null));
    api.memories(activeId).then(setMemories).catch(() => setMemories([]));
  }, [activeId]);
```

- [ ] **Step 3: Replace `RightPanel`.** Replace the entire `function RightPanel({ npc }: …) { … }` with the data-driven version (and update its call site to `<RightPanel detail={detail} memories={memories} />`):

```tsx
function RightPanel({ detail, memories }: { detail: NpcDetail | null; memories: MemoryItem[] }) {
  if (!detail) return <aside className="pane-right" />;
  const lp = detail.languageProfile;
  const langLabel = (c: string) => (({ en: 'EN', zh: '中文', ja: '日本語' } as Record<string, string>)[c] || c.toUpperCase());
  const weeks = detail.relationshipSince
    ? Math.max(1, Math.round((Date.now() - new Date(detail.relationshipSince).getTime()) / (7 * 86400000)))
    : 0;
  const dots = detail.relationship === 'close' ? 3 : detail.relationship === 'friend' ? 2 : 1;
  const isCJK = /[一-龥]/.test(detail.avatar.glyph);
  return (
    <aside className="pane-right">
      <div className="px-5 pt-6 pb-4 text-center">
        <div className="flex justify-center mb-3">
          <div className="rounded-2xl grid place-items-center"
               style={{ width: 88, height: 88, background: detail.avatar.bg, color: detail.avatar.ink, fontSize: 44, fontFamily: isCJK ? "'Outfit', sans-serif" : 'inherit' }}>
            {detail.avatar.glyph}
          </div>
        </div>
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <span className="text-[17px] font-medium">{detail.name}</span>
          <span style={{ color: 'var(--plum)' }} className="ai-dot">{WebI.sparkleF}</span>
        </div>
        <div className="text-[11px] font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          AI · {detail.persona}
        </div>
      </div>

      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] mb-2" style={{ color: 'var(--muted)' }}>Relationship · 关系</div>
        <div className="flex items-center gap-2 mb-2">
          <WebRelationshipDots value={dots} />
          <span className="text-[13px] font-medium">{RELATIONSHIP_LABEL[detail.relationship] || detail.relationship}</span>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--muted)' }}>
          {detail.chatStats.conversationCount > 0
            ? <>You've chatted <span style={{ color: 'var(--ink-2)' }} className="font-medium">{detail.chatStats.conversationCount} times</span>{weeks > 0 && <> over <span style={{ color: 'var(--ink-2)' }} className="font-medium">{weeks} week{weeks === 1 ? '' : 's'}</span></>}.</>
            : 'You haven’t chatted yet.'}
        </p>
      </div>

      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] mb-2" style={{ color: 'var(--muted)' }}>What {detail.name} knows about you</div>
        {detail.knownFacts.length > 0
          ? <ul className="space-y-1.5">{detail.knownFacts.map((f, i) => <KnowItem key={i}>{f}</KnowItem>)}</ul>
          : <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Nothing yet — keep chatting.</p>}
      </div>

      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="flex items-center gap-1.5 mb-2">
          <span style={{ color: 'var(--plum)' }}>{WebI.sparkleF}</span>
          <span className="text-[10px] font-mono uppercase tracking-[0.18em]" style={{ color: 'var(--plum-ink)' }}>Memories from this chat</span>
        </div>
        {memories.length > 0
          ? <div className="ai-border rounded-xl p-3">
              <div className="font-serif text-[15px] leading-tight" style={{ color: 'var(--ink)', fontWeight: 700 }}>{memories[0].title}</div>
              <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--ink-2)' }}>{memories[0].body}</p>
            </div>
          : <p className="text-[11px]" style={{ color: 'var(--muted)' }}>No memories yet.</p>}
      </div>

      <div className="px-5 py-4" style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] mb-2" style={{ color: 'var(--muted)' }}>Languages</div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-medium">{langLabel(lp.primary)}</span>
          {lp.occasional.length > 0 && <>
            <span style={{ color: 'var(--muted)' }}>·</span>
            <span style={{ color: 'var(--muted)' }}>occasional {lp.occasional.map(langLabel).join(', ')}</span>
          </>}
          <span className="text-[9.5px] font-mono uppercase tracking-wider ml-auto px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-warm)', color: 'var(--muted)' }}>{lp.register}</span>
        </div>
        {detail.topicInterests.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {detail.topicInterests.map((t) => (
              <span key={t} className="text-[10.5px] font-mono px-2 py-1 rounded" style={{ background: 'var(--bg-warm)', color: 'var(--ink-2)' }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
```

(`KnowItem` already exists in this file and is reused.)

- [ ] **Step 4: Typecheck the web.**

Run: `npm run typecheck -w apps/web`
Expected: exit 0.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/routes/App.tsx
git commit -m "feat(web): chat right panel renders live per-NPC detail + memories"
```

---

## Task 8: Final verification & branch wrap-up

- [ ] **Step 1: Typecheck everything.**

Run: `npm run typecheck && (cd packages/shared && npx tsc --noEmit) && echo OK`
Expected: exit 0 everywhere.

- [ ] **Step 2: Backend suite (Ollama forced down).**

Run: `OLLAMA_BASE_URL=http://127.0.0.1:1 npm test`
Expected: all green (prior 228 + the new scoping/seed tests).

- [ ] **Step 3: Runtime smoke with a non-Lily assertion.**

First add a check to `scripts/smoke-web.mjs`. In `flowChat`, after the existing Lily
assertions, click Mr. Chen and assert the right panel shows his identity:
```js
  // non-Lily NPC renders its own identity in the right panel
  await page.locator('button', { hasText: 'Chen' }).first().click();
  const showsChen = await page.waitForFunction(
    () => document.body.innerText.includes('Mr. Chen'), null, { timeout: 10000 }).then(() => true).catch(() => false);
  assert(showsChen, 'selecting Mr. Chen renders his identity (not hardcoded Lily)');
```

Then run the smoke: clear node, `npm run db:seed:demo`, start
`$env:OLLAMA_BASE_URL="http://127.0.0.1:1"; npm run dev:api` + `npm run dev:web`
(background), wait for `:3100/api/system/health`=200 and `:5173`=200, then
`node scripts/smoke-web.mjs all` → **SMOKE PASS**. Stop servers.

- [ ] **Step 4: Commit the smoke change.**

```bash
git add scripts/smoke-web.mjs
git commit -m "test(smoke): assert a non-Lily NPC renders its own identity"
```

- [ ] **Step 5: Branch completion.** Use **superpowers:finishing-a-development-branch** to complete `feat/live-npc-identity` (convention: `merge --no-ff` into `main`, then push — confirm with the user before pushing).

---

## Notes on scope (from the spec)

- **Deferred:** truly semantic per-NPC fact provenance beyond `knownToNpcs` membership; the
  Languages/Topics blocks are static reference data (no live refresh).
- **Unchanged:** `GET /api/npcs` list / `NpcListItem`; auth; scenario lifecycle; SSE.
- **Determinism:** always run the backend suite with `OLLAMA_BASE_URL=http://127.0.0.1:1`.
