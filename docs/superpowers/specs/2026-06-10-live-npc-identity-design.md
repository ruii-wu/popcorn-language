# Live NPC Identity (chat right panel + scenario page) — Design

**Date:** 2026-06-10
**Status:** approved (brainstorming) → ready for plan

## Goal

Stop the web from hardcoding **Lily** as the NPC. The scenario page and the chat
right panel must reflect the conversation's **actual** NPC, driven by real data.
The right panel is a **snapshot loaded at chat-open** (no polling); its dynamic
blocks refresh on re-entry (leave chat → scenario → back → App re-mounts → refetch).

## Key simplification (found during planning)

A `GET /api/npcs/:id` **detail** endpoint already exists and is purpose-built for the
persona panel — it returns `persona` (=`shortBio`), `languageProfile`, `relationship`
(stage), `knownFacts`, and `chatStats.conversationCount`. The web just never calls it.
So we **extend that endpoint** (add `avatar`, `topicInterests`, `relationshipSince`;
make `knownFacts` per-NPC) and have the right panel fetch it — **no list-endpoint
changes and no new route**. The list (`GET /api/npcs`, `NpcListItem`) stays as-is and
keeps feeding the conversation rail + chat-header avatar + the scenario page.

## Block behavior (final, per the user)

| Right-panel block | Behavior | Source |
|---|---|---|
| **NPC intro / persona** (name, avatar, subtitle, **Languages**, **Topics**) | **static, per-NPC** | `GET /api/npcs/:id` → `name`, `avatar`, `persona`, `languageProfile`, `topicInterests` |
| **Relationship** | **live on load** | `GET /api/npcs/:id` → `relationship`, `chatStats.conversationCount`, `relationshipSince` |
| **What {name} knows about you** | **live on load, per-NPC** | `GET /api/npcs/:id` → `knownFacts` (filtered by `knownToNpcs ∋ id`) |
| **Memories from this chat** | **live on load** | `GET /api/memories?npcId=` |

"static, per-NPC" = reference data rendered from the NPC's profile (changes when you
switch NPC, not over time). "live on load" = refetched on chat-open. All four come from
**two** fetches per chat-open: `api.npcDetail(activeId)` + `api.memories(activeId)`.

## Non-goals

- **Polling / per-turn refresh.** One fetch pair per chat-open; post-scenario updates
  come from route re-entry.
- **Semantic fact dedup / confidence ranking** beyond what exists (dedup by `predicate+value`).
- Auth, scenario lifecycle, SSE internals — untouched.
- `GET /api/npcs` list shape / `NpcListItem` — unchanged.

## Backend (`apps/api`)

### 1. Extend `GET /api/npcs/:id` (`app/api/npcs/[id]/route.ts`)
Add three fields and scope `knownFacts` to the NPC. All data is already loaded
(`n` = Npc, `rel` = the caller's Relationship):

```ts
const out: NpcDetail = {
  id: n.id,
  name: n.name,
  persona: n.shortBio,
  avatar: { glyph: n.avatarGlyph, bg: n.avatarBg, ink: n.avatarInk },   // NEW
  languageProfile: JSON.parse(n.languageProfile),
  topicInterests: JSON.parse(n.topicInterests),                          // NEW
  relationship: rel?.stage ?? 'acquaintance',
  relationshipSince: rel?.createdAt ?? null,                             // NEW
  knownFacts: await listFacts(prisma, userId, 8, n.id),                  // per-NPC
  chatStats: { messages, conversationCount: rel?.conversationCount ?? 0 },
};
return json(out);
```

### 2. Per-NPC `listFacts` (`src/server/memory/recall.ts`)
Add an optional `npcId`; filter by `knownToNpcs` in JS (SQLite has no JSON-array query).
Behavior for the no-`npcId` path is unchanged (newest `limit`).

```ts
export async function listFacts(
  prisma: PrismaClient, userId: string, limit = 8, npcId?: string,
): Promise<string[]> {
  const facts = await prisma.memoryFact.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  const scoped = npcId
    ? facts.filter((f) => (JSON.parse(f.knownToNpcs) as string[]).includes(npcId))
    : facts;
  return scoped.slice(0, limit).map((f) => factToText(f.predicate, f.value));
}
```

### 3. Per-NPC fact scoping in the live pipeline
Today `knownToNpcs` is set by the **seed** but never by live extraction. Thread the
chatting NPC through:

- `streamChat` already has `npcId` → pass it to `runPostTurnMemory`.
- `runPostTurnMemory` (`PostTurnDeps`): add `npcId` → pass to `extractAndStoreFacts`.
- `extractAndStoreFacts` (`FactExtractDeps`): add **optional** `npcId` (optional so the
  existing `fact-extract.test.ts` calls without it still compile):
  - **create:** `knownToNpcs: deps.npcId ? JSON.stringify([deps.npcId]) : '[]'`.
  - **dedup-hit:** if `npcId` set and not already in the fact's `knownToNpcs`, push it and
    `update` (does **not** increment the returned `stored` count — preserves the existing
    "n2 === 0 on re-run" test).

### 4. Demo seed (`prisma/seedDemo.ts`)
Currently gives all 3 NPCs the same 4 facts and dates relationships "now":

- **Differentiate facts** via `knownToNpcs`, e.g. Lily ← `likes:coffee`,
  `lives_near:Murray's Bagels`; Chen ← `works_as:software engineer`, `goal:work`;
  Emma ← `has_pet:cat`, `likes:music` (some may be shared).
- **Backdate** `relationship.createdAt` per NPC (Lily ~21d, Chen ~14d, Emma ~7d) so
  "chatted N times over M weeks" reads realistically.
- (optional) add a memory for Chen/Emma so their memories card isn't always empty.

## Shared types (`@popcorn/shared`)

New `NpcDetail` in `responses.ts` (the detail handler annotates `const out: NpcDetail`):

```ts
export interface NpcDetail {
  id: string;
  name: string;
  persona: string;                 // shortBio
  avatar: { glyph: string; bg: string; ink: string };
  languageProfile: { primary: string; occasional: string[]; register: string };
  topicInterests: string[];
  relationship: string;            // stage
  relationshipSince: string | Date | null;
  knownFacts: string[];            // per-NPC, factToText-formatted
  chatStats: { messages: number; conversationCount: number };
}
```
No `NpcListItem` change, no `Fact` type (`knownFacts` is already formatted strings).

## Web (`apps/web`)

### `components/shared.tsx`
- `export function npcView(item: NpcListItem)` → the avatar/name/etc. view-model for
  list items (App rail/header + Scenario lookup). **Delete** the static `NPCS_WEB`.

### `routes/App.tsx`
- Replace the local `mapNpc` with `npcView`.
- Add `detail` + `memories` state; on `activeId` change fetch `api.npcDetail(activeId)`
  and `api.memories(activeId)` (chat-open snapshot).
- `RightPanel({ detail, memories })`:
  - **Persona** (static): `detail.avatar`, `detail.name`, subtitle = `detail.persona`;
    **Languages** from `detail.languageProfile` (primary + occasional + `register` tag);
    **Topics** chips from `detail.topicInterests`.
  - **Relationship** (live): stage label + "chatted `{chatStats.conversationCount}` times
    over `{weeks}` weeks" (`weeks` from `relationshipSince`). Zero-state when no relationship.
  - **What {detail.name} knows** (live): `detail.knownFacts.map(...)`; empty-state.
  - **Memories from this chat** (live): `memories[0]` (title + body); empty-state.
  - Render nothing/skeleton until `detail` loads.

### `routes/Scenario.tsx`
- On mount also `api.npcs()`; resolve the session's NPC by `effectiveSession.npcId`
  (via `npcView`); render it in `ScenChatHeader`, `ScenMessage`, typing indicator —
  replacing every `NPCS_WEB[0]`. Neutral fallback if the lookup misses.

### `api/client.ts`
- `npcDetail: (id: string) => apiGet<NpcDetail>('/api/npcs/' + id)`.
- `memories: (npcId?: string) => apiGet<MemoryItem[]>('/api/memories' + (npcId ? '?npcId=' + npcId : ''))`.

## Testing / verification

- **Typecheck** (shared + api + web) green. `hono-app` mount test **unchanged** (no new route).
- **Updated test** `npc-known-facts.test.ts`: seed `MemoryFact.knownToNpcs` including
  `'lily'` and assert per-NPC scoping (a fact known only to another NPC is **absent**).
- **Extended** `npcs.test.ts` (detail): assert `avatar.glyph`, `topicInterests` is an array,
  `relationshipSince` present, `chatStats.conversationCount`.
- **New** `extractAndStoreFacts` npc-scoping test: create sets `knownToNpcs=[npcId]`; re-learn
  by another NPC merges; no-`npcId` path unchanged (existing test green).
- **Backend suite** all green with `OLLAMA_BASE_URL=http://127.0.0.1:1`.
- **Smoke:** assert a **non-Lily** NPC (Mr. Chen) renders its own name/avatar in the chat
  header + right-panel persona, and shows *its own* fact set (differentiated seed). `SMOKE PASS`.

## Risks

- `relationshipSince`/`conversationCount` are `null`/`0` for un-met NPCs → zero-state.
- Facts/memories may be empty for some NPCs → empty-states required.
- `knownToNpcs` filtering is JS-side after a per-user fetch (fact counts tiny — fine).
- Date convention stays `string | Date` (server `Date`, wire ISO).
