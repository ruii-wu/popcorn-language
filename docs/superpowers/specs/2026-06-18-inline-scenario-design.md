# Inline Scenario in the Main App — Design

**Date:** 2026-06-18
**Status:** Approved
**Author:** brainstormed with the user

## Problem

Accepting a scenario today does `<a href="/scenario">`, a hard browser navigation to a
separate full-screen route (`apps/web/src/routes/Scenario.tsx`). That route:

- reloads the whole SPA (white flash, loses in-app state),
- loads its **own** data and picks a session globally — not tied to the NPC you were
  chatting with,
- renders `WebConversationsRail` with **no `npcs` prop** (`npcs = []` default), so the left
  conversation list is **empty**.

The combined effect is a jarring jump to what looks like a blank new page. The user wants
the scenario to feel continuous with the chat: keep the left rail, stay in the same
conversation, change only the center and right of the screen ("仅在当前会话里变").

This matches the prototype (`docs/prd-assets/prototype-scenario-active.png`), where casual →
invitation → active → aftermath all happen in **one shell** with the rail preserved.

## Goal

A scenario becomes a **state of the conversation you're already in**, not a separate
destination. You stay in the main app with the NPC; only the center pane and right panel
change to reflect scenario mode. The left rail, dock, and chrome never move. No URL change,
no reload.

## Architecture

The scenario is driven by a **per-NPC "live session"** owned by `App.tsx`. The conversation
pane, right panel, and composer render conditionally on that session's status:

| status            | center pane                                         | right panel                              | composer                  |
|-------------------|-----------------------------------------------------|------------------------------------------|---------------------------|
| none (casual)     | chat history                                        | NPC persona / facts / memories *(today)* | text Composer             |
| `invited`         | history + **InvitationCard inline**                 | "What to expect"                         | accept / decline buttons  |
| `active`          | roleplay header badge + turn counter + scenario turns | **"NPC's perspective"** + HUD            | **ChoiceComposer**        |
| `completed`       | **Summary card inline**                             | aftermath ("saved to journey")           | text Composer returns     |

The session is keyed per NPC. Switching NPCs shows that NPC's own state; returning resumes an
in-progress scenario (re-fetch the NPC's live session on `activeId` change).

## Componentization

All scenario UI + logic currently lives privately inside `Scenario.tsx`. Extract it into
focused, reusable units so `App.tsx` does not bloat and there is a single source of truth:

- **`apps/web/src/components/scenario/parts.tsx`** — presentational pieces moved out of
  `Scenario.tsx`: `InvitationCard`, `ScenMessage`, `ChoiceComposer`, `ScenarioHUD`,
  `ScenarioSummaryCard`, the roleplay header treatment, and the scenario right-panel variants
  (Invitation / Active / Aftermath).
- **`apps/web/src/components/scenario/useScenarioSession.ts`** — a hook that owns the
  lifecycle for an NPC: load the session, `accept()`, `decline()`, `choose(choice)`, and
  exposes `{ session, status, messages, choices, hudState, summary, choiceDisabled,
  npcTyping, … }`. This is the brain; `App.tsx` consumes it.

`App.tsx` wires the hook into its existing rail / center / right / dock layout.

## Data flow

1. Casual chat streams as today. The `scenario_offer` SSE event (already emitted by
   `streamChat`, now firing after the trigger window fix) sets the inline session to
   `invited` and renders `InvitationCard` **inline** instead of the old "Open scenario →"
   link.
2. **Accept** → `api.acceptSession(id)` → seed the opening NPC line + choices + HUD; status →
   `active`; header / HUD / right panel / composer switch.
3. **Choose** → `api.streamChoose(id, choiceId, …)` → append turns, update HUD, refresh
   choices; `scenario_end` → set summary, status → `completed`.
4. **Completed** → inline summary; aftermath right panel; text composer returns. Relationship
   / journey already updated server-side.
5. **Switching NPCs** mid-scenario is safe: state is per-NPC; stream events are applied only
   if their session matches the currently-active NPC (guards stale writes).

## `/scenario` route

The standalone player becomes redundant. **`/scenario` becomes a thin redirect** into the
main app, selecting whichever NPC has a live (invited/active) session — else the most recent
completed one — and the dock's "02 Scenario" entry points there. This retires the duplicate
code path (single source of truth in `App.tsx`) while keeping the dock / deep-links working.

## Error handling

- Accept / choose failure → re-enable controls, inline system line (as `Scenario.tsx` does
  today).
- `scenario_offer` arrives but accept fails → card stays, user retries.
- LLM unavailable during a choice → same error bubble as casual chat.

## Testing

Web-only change — no API change, so all backend scenario tests stay green. The web's safety
net is the Playwright smoke (`scripts/smoke-web.mjs`); extend it to drive the **inline** flow
end-to-end:

- chat Lily → assert `InvitationCard` renders **with the rail still showing Lily/Chen/Emma**
  and **URL still `/`** (proves no new page),
- accept → assert roleplay header + choice cards appear, still at `/`,
- pick a choice → assert a new turn renders.

Plus `npm run typecheck` clean.

## Files touched

- **New:** `apps/web/src/components/scenario/parts.tsx`,
  `apps/web/src/components/scenario/useScenarioSession.ts`
- **Edit:** `apps/web/src/routes/App.tsx` (conditional center / right, inline invitation,
  choice composer), router + dock (repoint `/scenario`), `apps/web/src/routes/Scenario.tsx`
  (reduce to redirect)
- **Edit:** `scripts/smoke-web.mjs` (inline flow)

## Non-goals

- No backend / API change (session lifecycle already works).
- No new scenario content; Mr. Chen still has no template (tracked separately).
- No change to the casual chat, persona panel, or memory features beyond the conditional
  render.
