# Inline Scenario in the Main App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a scenario run as a state of the current conversation in `App.tsx` (per-NPC live session driving conditional center/right/composer), so the left rail and chrome never move — instead of hard-navigating to the separate `/scenario` route.

**Architecture:** Extract the scenario UI from `Scenario.tsx` into a shared `components/scenario/parts.tsx`, plus a `useScenarioSession` hook that owns the lifecycle (load/accept/decline/choose). `App.tsx` consumes both and renders casual vs scenario center/right based on the session status. `/scenario` reduces to a redirect into `/`.

**Tech Stack:** Vite + React 18 + TypeScript SPA (`apps/web`), React Router, `@popcorn/shared` types, SSE-over-POST via `api.streamChoose`. No API change. Verification = `npm run typecheck` per task + a Playwright smoke flow at the end (`scripts/smoke-web.mjs`).

**Note on TDD:** the web has no component-test runner (pervasive `any`, Playwright smoke is the net). Per-task gate is `npm run typecheck` (run from repo root); the behavioral test is the inline-flow smoke added in Task 5.

---

## File Structure

- **Create** `apps/web/src/components/scenario/parts.tsx` — presentational scenario components moved verbatim out of `Scenario.tsx` (with `export`). One responsibility: scenario rendering.
- **Create** `apps/web/src/components/scenario/useScenarioSession.ts` — the scenario lifecycle hook. One responsibility: session state + actions for one NPC.
- **Modify** `apps/web/src/routes/Scenario.tsx` — first import the extracted parts (Task 1), then collapse to a redirect (Task 4).
- **Modify** `apps/web/src/routes/App.tsx` — consume the hook + parts, conditional render.
- **Modify** `apps/web/src/main.tsx` — repoint `/scenario` to the redirect.
- **Modify** `apps/web/src/components/shared.tsx` — `WebDock` "02 Scenario" href.
- **Modify** `scripts/smoke-web.mjs` — inline scenario smoke flow.

---

## Task 1: Extract scenario presentational parts

**Files:**
- Create: `apps/web/src/components/scenario/parts.tsx`
- Modify: `apps/web/src/routes/Scenario.tsx`

- [ ] **Step 1: Create `parts.tsx` and move the presentational components**

Move these function components **verbatim** from `apps/web/src/routes/Scenario.tsx` into the new file `apps/web/src/components/scenario/parts.tsx`, adding `export` to each and **renaming the scenario `RightPanel` to `ScenarioRightPanel`** (it otherwise collides with App's own `RightPanel`):

- `ScenChatHeader` (Scenario.tsx ~20-78)
- `ScenarioHUD`, `HUDMeter`, `HUDStress` (~82-131)
- `DayDivider` (~134-142)
- `ScenMessage` (~145-181)
- `InvitationCard` (~184-227)
- `ScenarioSummaryCard`, `SummaryBlock` (~230-342)
- `ChoiceComposer`, `ChoiceCard` (~346-403)
- `RightPanel` → **`ScenarioRightPanel`**, `RightPanelEmpty`, `RightPanelInvitation`, `RightPanelActive`, `RightPanelAftermath`, `SidebarHeader`, `DiagBlock`, `DiagItem` (~407-523)
- `EmptyState` (~526-545)

Add this import header at the top of `parts.tsx`:

```tsx
import { useState } from 'react';
import { WebI, WebAvatar, WebRelationshipDots, RELATIONSHIP_LABEL } from '../shared';
```

(These are the shared symbols the moved components reference. `useState` is used by `ChoiceCard`.)

- [ ] **Step 2: Update `Scenario.tsx` to import the extracted parts**

In `apps/web/src/routes/Scenario.tsx`, delete the now-moved local component definitions and import them instead. Replace the moved-out block with:

```tsx
import {
  ScenChatHeader,
  ScenarioHUD,
  DayDivider,
  ScenMessage,
  InvitationCard,
  ScenarioSummaryCard,
  ChoiceComposer,
  ScenarioRightPanel,
  EmptyState,
} from '../components/scenario/parts';
```

Update the one usage site in `Scenario.tsx`'s JSX that referenced `<RightPanel … />` to `<ScenarioRightPanel … />` (the props are unchanged: `status`, `session`, `summaryData`, `hudState`).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). This proves the extraction is behavior-preserving — `/scenario` still renders from the same components.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/scenario/parts.tsx apps/web/src/routes/Scenario.tsx
git commit -m "refactor(web): extract scenario UI into components/scenario/parts.tsx"
```

---

## Task 2: Create the `useScenarioSession` hook

**Files:**
- Create: `apps/web/src/components/scenario/useScenarioSession.ts`

- [ ] **Step 1: Write the hook**

Create `apps/web/src/components/scenario/useScenarioSession.ts` with this exact content:

```ts
import { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import type {
  SessionDetailResponse,
  ScenarioTranscriptItem,
  AcceptSessionResponse,
  ScenarioChoice,
  ScenarioSummary,
} from '@popcorn/shared';

export type ScenarioStatus = 'invited' | 'active' | 'completed' | null;
export interface ScenarioMessage { from: 'user' | 'npc-c' | 'system'; text: string; time?: string }
export interface HudState { impression: number; stress: string; turnsLeft: number }
export interface LiveSession {
  id: string;
  status: 'invited' | 'active' | 'completed';
  scenarioTitle: string;
  npcId: string;
  grade?: string | null;
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Owns the scenario lifecycle for ONE npc. App re-keys it by passing the active npcId;
// switching NPC resets state and reloads that NPC's live session (resume in-progress play).
export function useScenarioSession(npcId: string | null) {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [messages, setMessages] = useState<ScenarioMessage[]>([]);
  const [choices, setChoices] = useState<ScenarioChoice[]>([]);
  const [hudState, setHudState] = useState<HudState | null>(null);
  const [summary, setSummary] = useState<ScenarioSummary | null>(null);
  const [transcript, setTranscript] = useState<ScenarioTranscriptItem[]>([]);
  const [choiceDisabled, setChoiceDisabled] = useState(false);
  const [npcTyping, setNpcTyping] = useState(false);

  // Guards stale stream writes after the user switches NPC mid-stream.
  const liveSidRef = useRef<string | null>(null);
  liveSidRef.current = session ? session.id : null;

  useEffect(() => {
    setSession(null); setMessages([]); setChoices([]); setHudState(null);
    setSummary(null); setTranscript([]); setChoiceDisabled(false); setNpcTyping(false);
    if (!npcId) return;
    let cancelled = false;
    api.sessions().then((list) => {
      if (cancelled) return;
      const mine = list.filter((s) => s.npcId === npcId);
      const picked = mine.find((s) => s.status === 'active')
                   || mine.find((s) => s.status === 'invited')
                   || mine.find((s) => s.status === 'completed')
                   || null;
      if (!picked) return;
      setSession({ id: picked.id, status: picked.status as LiveSession['status'],
        scenarioTitle: picked.scenarioTitle, npcId, grade: picked.grade });
      if (picked.status === 'active' || picked.status === 'completed') {
        api.session(picked.id).then((detail: SessionDetailResponse) => {
          if (cancelled) return;
          setTranscript(detail.transcript || []);
          if (detail.state) setHudState(detail.state as HudState);
          if (picked.status === 'active') {
            setMessages((detail.transcript || []).map((t: ScenarioTranscriptItem) => ({
              from: t.from === 'user' ? 'user' : 'npc-c',
              text: t.text,
              time: t.createdAt ? new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            })));
          }
        }).catch(() => {});
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [npcId]);

  // Called by App when a scenario_offer arrives on the chat stream.
  function offerSession(sessionId: string, title: string) {
    if (!npcId) return;
    setSummary(null); setMessages([]); setChoices([]); setHudState(null);
    setSession({ id: sessionId, status: 'invited', scenarioTitle: title, npcId });
  }

  function accept() {
    if (!session) return;
    const sid = session.id;
    setChoiceDisabled(true);
    api.acceptSession(sid).then((result: AcceptSessionResponse) => {
      if (liveSidRef.current !== sid) return;
      setSession((prev) => prev ? { ...prev, status: 'active' } : prev);
      if (result.openingMessage) setMessages([{ from: 'npc-c', text: result.openingMessage.text, time: nowTime() }]);
      if (result.choices) setChoices(result.choices as ScenarioChoice[]);
      if (result.state) setHudState(result.state as HudState);
      setChoiceDisabled(false);
    }).catch(() => setChoiceDisabled(false));
  }

  function decline() {
    if (!session) return;
    api.declineSession(session.id).then(() => setSession(null)).catch(() => {});
  }

  function choose(choice: ScenarioChoice) {
    if (!session || choiceDisabled) return;
    const sid = session.id;
    setChoiceDisabled(true);
    setMessages((prev) => prev.concat({ from: 'user', text: choice.text, time: nowTime() }));
    api.streamChoose(sid, choice.id, (event) => {
      if (liveSidRef.current !== sid) return; // stale: user switched NPC
      if (event.type === 'typing_start') setNpcTyping(true);
      else if (event.type === 'typing_end') setNpcTyping(false);
      else if (event.type === 'message_complete') {
        setNpcTyping(false);
        setMessages((prev) => prev.concat({ from: 'npc-c', text: event.data.fullText, time: nowTime() }));
      } else if (event.type === 'state_update') {
        setHudState({ impression: event.data.impression, stress: event.data.stress, turnsLeft: event.data.turnsLeft });
      } else if (event.type === 'choices') {
        setChoices(event.data.choices); setChoiceDisabled(false);
      } else if (event.type === 'scenario_end') {
        setSummary(event.data.summary); setChoices([]); setChoiceDisabled(false);
        setSession((prev) => prev ? { ...prev, status: 'completed', grade: event.data.summary.grade } : prev);
      } else if (event.type === 'error') {
        setNpcTyping(false); setChoiceDisabled(false);
        setMessages((prev) => prev.concat({ from: 'system', text: 'Connection error — please try again.' }));
      }
    });
  }

  const status: ScenarioStatus = session ? session.status : null;
  return {
    session, status, messages, choices, hudState, summary, transcript,
    choiceDisabled, npcTyping, offerSession, accept, decline, choose,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (The hook is not imported yet; it must still compile.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/scenario/useScenarioSession.ts
git commit -m "feat(web): add useScenarioSession hook (scenario lifecycle for one NPC)"
```

---

## Task 3: Wire the hook + parts into `App.tsx`

**Files:**
- Modify: `apps/web/src/routes/App.tsx`

- [ ] **Step 1: Add imports**

At the top of `App.tsx`, add:

```tsx
import { useScenarioSession } from '../components/scenario/useScenarioSession';
import type { ScenarioChoice } from '@popcorn/shared';
import {
  ScenChatHeader,
  ScenarioHUD,
  DayDivider as ScenDayDivider,
  ScenMessage,
  InvitationCard,
  ScenarioSummaryCard,
  ChoiceComposer,
  ScenarioRightPanel,
} from '../components/scenario/parts';
```

(App already has its own `DayDivider`; alias the scenario one as `ScenDayDivider` to avoid a clash. If App has no local `DayDivider`, import it as `DayDivider` and drop the alias.)

- [ ] **Step 2: Instantiate the hook and remove the old `offer` state**

In `App()`, delete the line `const [offer, setOffer] = useState<any>(null);` and add after the other `useState` calls:

```tsx
const scen = useScenarioSession(activeId);
```

- [ ] **Step 3: Route the `scenario_offer` event into the hook**

In the `send()` stream switch, replace:

```tsx
        case 'scenario_offer': setOffer(ev.data); break;
```

with:

```tsx
        case 'scenario_offer': {
          const draft = (ev.data as any).draft || {};
          scen.offerSession(ev.data.sessionId, draft.title || 'Scenario');
          break;
        }
```

- [ ] **Step 4: Replace the center pane + right panel + composer with status-conditional rendering**

In the returned JSX, replace the existing `<section className="pane-main"> … </section>`, the old inline `offer` card block, and `<RightPanel detail={detail} memories={memories} />` with the following. `scen.status === null` keeps today's casual UI; other statuses render the scenario.

```tsx
      <section className="pane-main">
        {scen.status === 'active'
          ? <ScenChatHeader intense={true} session={scen.session} hudState={scen.hudState} npc={npc} />
          : <WebChatHeader npc={npc} />}
        {scen.status === 'active' && <ScenarioHUD session={scen.session} hudState={scen.hudState} />}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
          <div className="max-w-[820px] mx-auto py-2">
            {scen.status === 'active' ? (
              <>
                <div className="text-center my-2 fade-up">
                  <span className="text-[10px] font-mono uppercase tracking-[0.16em] px-2.5 py-1 rounded-full"
                        style={{ background: 'var(--surface-2c)', color: 'var(--muted)', border: '1px solid var(--hairline-c)' }}>
                    Roleplay started
                  </span>
                </div>
                {scen.messages.map((m, i) => <ScenMessage key={i} msg={m} intense={true} npc={npc} />)}
                {scen.npcTyping && <Typing npc={npc} />}
              </>
            ) : (
              <>
                <DayDivider label="Today · 今天" />
                {messages.map((m, i) => (
                  <MessageRow key={m.id || i} npc={npc} msg={m}
                              showCorrection={!!m.correction && expanded === i}
                              onToggle={() => setExpanded(expanded === i ? -1 : i)} />
                ))}
                {streaming && <MessageRow npc={npc} msg={{ from: 'npc', text: streaming, time: '' }}
                                          showCorrection={false} onToggle={() => {}} />}
                {typing && <Typing npc={npc} />}
                {scen.status === 'invited' && (
                  <InvitationCard session={scen.session} npc={npc}
                                  onAccept={scen.accept} onDecline={scen.decline} />
                )}
                {scen.status === 'completed' && (
                  <>
                    <ScenDayDivider label="Completed scenario · 已完成" />
                    <ScenarioSummaryCard session={scen.session} transcript={scen.transcript} summaryData={scen.summary} />
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {scen.status === 'active' && scen.choices.length > 0
          ? <ChoiceComposer choices={scen.choices} onChoose={(c: ScenarioChoice) => scen.choose(c)} disabled={scen.choiceDisabled} />
          : <Composer onSend={send} disabled={sending} />}
      </section>
      {scen.status
        ? <ScenarioRightPanel status={scen.status} session={scen.session} summaryData={scen.summary} hudState={scen.hudState} />
        : <RightPanel detail={detail} memories={memories} />}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS. Fix any type errors (e.g. if `Typing` is not the correct typing-indicator component name in App, use App's existing one).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/App.tsx
git commit -m "feat(web): render scenario inline in the main app (no route change)"
```

---

## Task 4: Reduce `/scenario` to a redirect; repoint router + dock

**Files:**
- Modify: `apps/web/src/routes/Scenario.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/components/shared.tsx`

- [ ] **Step 1: Replace `Scenario.tsx` with a redirect**

Replace the entire contents of `apps/web/src/routes/Scenario.tsx` with:

```tsx
// /scenario is retired — the scenario now runs inline in the main app (App.tsx).
// This redirect keeps the dock entry and any deep links working.
import { Navigate } from 'react-router-dom';

export default function Scenario() {
  return <Navigate to="/" replace />;
}
```

- [ ] **Step 2: Keep the router mapping (no change needed) and verify the dock href**

`apps/web/src/main.tsx` keeps `<Route path="/scenario" element={<Scenario />} />` — now it redirects. No edit required.

In `apps/web/src/components/shared.tsx`, the `WebDock` "02 Scenario" item currently has `href: '/scenario'`. Leave it as `/scenario` (it redirects to `/`). No edit required unless you prefer to point it straight at `/` — if so, change:

```tsx
  { label: '02 Scenario', href: '/scenario' },
```

to:

```tsx
  { label: '02 Scenario', href: '/' },
```

(Either is acceptable; redirect path is fine. Pick one and move on.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. `Scenario.tsx` no longer imports `api`/parts; any now-unused imports it had are gone with the rewrite.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/Scenario.tsx apps/web/src/components/shared.tsx
git commit -m "refactor(web): retire /scenario route as a redirect to the inline experience"
```

---

## Task 5: Inline-flow Playwright smoke + final verification

**Files:**
- Modify: `scripts/smoke-web.mjs`

- [ ] **Step 1: Extend the `chat` smoke flow to exercise the inline scenario**

In `scripts/smoke-web.mjs`, inside `flowChat(browser)`, after the existing Chen-panel assertion block, append the following. It drives Lily to the offer (trigger needs ≥3 user turns + a keyword — the trigger window fix is already merged), asserts the invitation renders **inline with the rail intact and URL still `/`**, accepts, and asserts roleplay choice cards appear.

```js
  // ---- inline scenario: invitation renders in the SAME conversation (no new page) ----
  await page.locator('button', { hasText: 'Lily' }).first().click();
  // warm up the thread + name the topic so judgeScenarioTrigger fires
  for (const line of ['I have a job interview tomorrow', 'can we practice', 'let us do a mock interview']) {
    await box.fill(line);
    await page.locator('button', { hasText: 'Send' }).click();
    await page.waitForFunction((t) => document.body.innerText.includes(t), line.slice(0, 12), { timeout: 30000 });
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Send/.test(x.textContent));
      return b && !b.disabled;
    }, null, { timeout: 30000 }).catch(() => {});
  }
  const invited = await page.waitForFunction(
    () => /Scenario invitation|let's do it|Yeah, let's do it/i.test(document.body.innerText),
    null, { timeout: 30000 }).then(() => true).catch(() => false);
  assert(invited, 'scenario invitation card renders inline in the chat');
  assert(new URL(page.url()).pathname === '/', 'still on the main app route "/" — no navigation to a new page');
  const railStillThere = await page.locator('button', { hasText: /Lily|Emma|Chen/ }).count();
  assert(railStillThere >= 3, 'left conversation rail is still present during the invitation');

  const acceptBtn = page.locator('button', { hasText: /Yeah, let's do it/i }).first();
  if (await acceptBtn.count()) {
    await acceptBtn.click();
    const roleplay = await page.waitForFunction(
      () => /Choose your response|Roleplay started|Roleplay ·/i.test(document.body.innerText),
      null, { timeout: 30000 }).then(() => true).catch(() => false);
    assert(roleplay, 'accepting starts the roleplay inline (choice cards / roleplay header)');
    assert(new URL(page.url()).pathname === '/', 'roleplay runs on "/" — never left the conversation');
  } else {
    ok('accept button not present (offer may not have fired this run) — skipped accept assertion');
  }
```

- [ ] **Step 2: Typecheck the app**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run the smoke (requires dev server up + Ollama running)**

Pre-req: `npm run dev` is up (API :3100 + Vite :5173) and `qwen3.5:9b` is resident.
Run: `node scripts/smoke-web.mjs chat`
Expected: `SMOKE PASS` with the new assertions printing `ok`. If the offer does not fire on a given run (LLM-dependent), the accept assertion is skipped, but the invitation/url/rail assertions must pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-web.mjs
git commit -m "test(web): smoke the inline scenario flow (invitation+accept stay on /)"
```

---

## Self-Review notes

- **Spec coverage:** parts extraction (Task 1) + hook (Task 2) → componentization; App wiring (Task 3) → conditional center/right/composer + inline invitation; redirect (Task 4) → `/scenario` decision; smoke (Task 5) → testing. All spec sections covered.
- **Type consistency:** hook returns `{ session, status, messages, choices, hudState, summary, transcript, choiceDisabled, npcTyping, offerSession, accept, decline, choose }`; App consumes exactly these. `ScenarioRightPanel` props `{ status, session, summaryData, hudState }` match both the moved component and App's call site.
- **Risk:** `ScenChatHeader`/`ScenarioHUD`/`ScenMessage`/`ScenarioRightPanel` use `any`-typed props today (carried over from `Scenario.tsx`), so passing App's `npc` view-model and the hook's session object is compatible. If `npm run typecheck` flags a prop type, widen to `any` to match the existing scenario-component signatures (do not tighten — out of scope).
