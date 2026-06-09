# Live NPC Identity (chat right panel + scenario page) — Design

**Date:** 2026-06-10
**Status:** approved (brainstorming) → ready for plan

## Goal

Stop the web from hardcoding **Lily** as the NPC. The scenario page and the chat
right panel must reflect the conversation's **actual** NPC, driven by real data.
The right panel is a **snapshot loaded at chat-open** (no polling); its dynamic
blocks refresh on re-entry (leave chat → scenario → back → App re-mounts → refetch).

## Block behavior (final, per the user)

| Right-panel block | Behavior | Source | Backend work |
|---|---|---|---|
| **NPC intro / persona** (name, avatar, subtitle, **Languages**, **Topics**) | **static, per-NPC** | `name`, `avatar`, `shortBio`, `languageProfile`, `topicInterests` | expose `shortBio` + `languageProfile` + `topicInterests` on `/api/npcs` |
| **Relationship** | **live on load** | stage/stageValue (exposed) + `conversationCount` + `relationshipSince` | add `conversationCount` + `relationshipSince` to `/api/npcs` |
| **What {name} knows about you** | **live on load, per-NPC** | `MemoryFact` rows where `knownToNpcs ∋ npcId` | **new** `GET /api/npcs/:id/facts` + thread `npcId` through live extraction + differentiate the seed |
| **Memories from this chat** | **live on load** | `GET /api/memories?npcId=` | exists — client tweak only |

"static, per-NPC" = reference data rendered from the active NPC's profile (changes
when you switch NPC, not over time). "live on load" = refetched on chat-open.

## Non-goals

- **Polling / per-turn refresh.** One fetch per chat-open; post-scenario updates
  come from route re-entry.
- **Semantic fact dedup / confidence ranking** beyond what exists. Facts are
  deduped by `predicate+value` as today.
- Auth, scenario lifecycle, SSE internals — untouched.

## Backend (`apps/api`)

### 1. Extend `GET /api/npcs`
All five new fields come from data the handler already loads (`n` = Npc,
`rel` = the caller's Relationship):

```ts
shortBio: n.shortBio,                              // string
languageProfile: JSON.parse(n.languageProfile),    // { primary, occasional[], register }
topicInterests: JSON.parse(n.topicInterests),      // string[]
conversationCount: rel?.conversationCount ?? 0,    // number
relationshipSince: rel?.createdAt ?? null,         // string | Date | null
```

### 2. New `GET /api/npcs/:id/facts`
Cookie-auth (`withUser`). Returns the caller's facts that **this NPC knows**,
each with a precomputed display string via the existing `factToText`:

```ts
// Fact = { id: string; predicate: string; value: string; text: string }
const rows = await prisma.memoryFact.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
const out: Fact[] = rows
  .filter((f) => (JSON.parse(f.knownToNpcs) as string[]).includes(params.id))
  .map((f) => ({ id: f.id, predicate: f.predicate, value: f.value, text: factToText(f.predicate, f.value) }));
return json(out);
```
Mounted in `src/http/app.ts`; added to the `hono-app` mount-table test.

### 3. Per-NPC fact scoping in the live pipeline
Today `knownToNpcs` is set by the **seed** but never by live extraction. Thread the
chatting NPC through so live-learned facts are scoped too:

- `streamChat` already has `npcId` → pass it to `runPostTurnMemory`.
- `runPostTurnMemory` (`PostTurnDeps`): add `npcId` → pass to `extractAndStoreFacts`.
- `extractAndStoreFacts` (`FactExtractDeps`): add **optional** `npcId` (optional so
  the existing `fact-extract.test.ts` calls without it still compile):
  - **create:** `knownToNpcs: npcId ? JSON.stringify([npcId]) : '[]'`.
  - **dedup-hit (existing fact):** if `npcId` is set and not already in the fact's
    `knownToNpcs`, push it and `update` (does **not** increment the returned
    `stored` count — preserves the current "n2 === 0 on re-run" test semantics).

### 4. Demo seed (`prisma/seedDemo.ts`)
Make the per-NPC feature visible (it currently gives all 3 NPCs all 4 facts and
relationships dated "now"):

- **Differentiate facts** by `knownToNpcs`, e.g. Lily ← `likes:coffee`,
  `lives_near:Murray's Bagels`; Chen ← `works_as:software engineer`, `goal:work`;
  Emma ← `has_pet:cat`, `likes:music`. Some may overlap (shared facts).
- **Backdate** `relationship.createdAt` per NPC (Lily ~3 wk, Chen ~2 wk, Emma ~1 wk)
  so "chatted N times over M weeks" reads realistically.
- (optional) add a memory for Chen/Emma so their "Memories from this chat" card
  isn't always empty.

## Shared types (`@popcorn/shared`)

- `NpcListItem` (+): `shortBio: string`, `languageProfile: { primary: string;
  occasional: string[]; register: string }`, `topicInterests: string[]`,
  `conversationCount: number`, `relationshipSince: string | Date | null`.
- New `Fact`: `{ id: string; predicate: string; value: string; text: string }`.

Handler annotations (`const out: NpcListItem[] = …`, `const out: Fact[] = …`) lock
both shapes — a rename fails `apps/api` compilation.

## Web (`apps/web`)

### `components/shared.tsx`
- `export function npcView(item: NpcListItem)` → the avatar/name/etc. view-model
  (now also carries `shortBio`, `languageProfile`, `topicInterests`,
  `conversationCount`, `relationshipSince`). **Delete** the static `NPCS_WEB`.

### `routes/App.tsx`
- Replace local `mapNpc` with `npcView`.
- On `activeId` change, fetch `api.npcFacts(activeId)` + `api.memories(activeId)`.
- `RightPanel({ npc, facts, memories })`:
  - **Persona** (static): avatar, name, subtitle = `shortBio`; **Languages** from
    `languageProfile` (primary + occasional + `register` tag); **Topics** chips from
    `topicInterests`.
  - **Relationship** (live): stage dots/label + "chatted `{conversationCount}` times
    over `{weeks}` weeks" (`weeks` computed from `relationshipSince`). Zero-state
    when no relationship.
  - **What {name} knows** (live, per-NPC): `facts.map(f => f.text)`; empty-state.
  - **Memories from this chat** (live): `memories[0]` (title + body); empty-state.

### `routes/Scenario.tsx`
- On mount also `api.npcs()`; resolve the session's NPC by `effectiveSession.npcId`
  (via `npcView`); render it in `ScenChatHeader`, `ScenMessage`, typing indicator —
  replacing every `NPCS_WEB[0]`. Neutral fallback if the lookup misses.

### `api/client.ts`
- `memories: (npcId?: string) => apiGet<MemoryItem[]>('/api/memories' + (npcId ? '?npcId=' + npcId : ''))`.
- `npcFacts: (npcId: string) => apiGet<Fact[]>('/api/npcs/' + npcId + '/facts')`.

## Testing / verification

- **Typecheck** (shared + api + web) green; `hono-app` mount test includes the new
  facts route.
- **New backend tests:** `GET /api/npcs/:id/facts` (401 w/o cookie; returns only the
  facts whose `knownToNpcs` includes the id). `extractAndStoreFacts` npc-scoping
  (create sets `knownToNpcs=[npcId]`; re-learn by another NPC merges it; no-npcId
  path unchanged → existing test green).
- **Backend suite** 228+/all green with `OLLAMA_BASE_URL=http://127.0.0.1:1`.
- **Smoke:** assert a **non-Lily** NPC (Mr. Chen) renders its own name/avatar in the
  chat header + right-panel persona, and shows *its own* fact set (differentiated
  seed). `SMOKE PASS`.

## Risks

- `relationshipSince`/`conversationCount` are `null`/`0` for un-met NPCs → zero-state.
- Facts/memories may be empty for some NPCs → empty-states required.
- SQLite has no JSON-array query, so `knownToNpcs` filtering is done in JS after a
  per-user fetch (fact counts are tiny — fine).
- Date convention stays `string | Date` (server `Date`, wire ISO).
