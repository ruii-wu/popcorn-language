# Popcorn Language — User Acceptance Testing (UAT) SOP

**Standard Operating Procedure for User Acceptance Testing**

| | |
|---|---|
| **Project** | Popcorn Language (NUS MComp Capstone) |
| **Build under test** | `main` @ `eceedc5` — backend W1–W8 + wired web client (W10) |
| **Chat model** | `qwen3.5:9b` (embeddings: `nomic-embed-text`) |
| **Document version** | 1.0 |
| **Date** | 2026-05-31 |
| **Owner** | _<your name>_ |

---

## 1. Purpose

This SOP defines a repeatable procedure for **User Acceptance Testing** of the Popcorn
Language web client. UAT confirms that the product, as experienced through the browser UI at
`http://localhost:3100/app/*`, behaves correctly against the **live backend** and satisfies the
intended learner workflows: onboarding, persistent NPC chat, the Journey dashboard, scenario
gameplay, and settings.

UAT here is **acceptance-level, manual, black-box** testing performed by an evaluator acting as
an end user. It is distinct from the automated `vitest` suite (developer-level) and the
`smoke:web` headless check (regression aid).

## 2. Scope

**In scope** — end-to-end user-facing flows via the web client:

- Account onboarding (wizard) and login
- Chat: NPC list, relationship stages, thread history, streaming replies, grammar correction
- Journey dashboard: streak, relationships, achievements, memories
- Scenario gameplay: invitation → accept/decline → turn-by-turn play → graded summary
- Settings: memory strategy, grammar-correction toggle, model name
- Cross-screen navigation, session/logout, and graceful degradation when Ollama is offline

**Out of scope** (do **not** raise these as UAT defects):

- **Authentication security.** Auth is intentionally minimal (plaintext password, single-query
  login, `pop_uid` cookie) — a documented local-demo design choice, **not** a contribution and
  **never** to be deployed beyond localhost. See [README → A note on auth](../README.md#a-note-on-auth).
- Load / stress / concurrency, cross-browser matrix, mobile responsiveness, deployment/hosting.
- LLM answer *quality* judged subjectively (UAT verifies the *workflow*, not essay grading).
- See **§13 Known by-design behaviors** before logging anything.

## 3. References

- [`README.md`](../README.md) — setup, run, API surface
- [`docs/reports/architecture.md`](reports/architecture.md) — system architecture
- [`docs/context.md`](context.md) — product background
- `scripts/smoke-web.mjs` — headless end-to-end smoke (automated regression aid)

## 4. Roles & responsibilities

| Role | Responsibility |
|---|---|
| **UAT Tester** | Executes test cases per this SOP, records actual results, logs defects. |
| **Facilitator / Observer** | Prepares the environment, observes the session, clarifies expected behavior, captures notes. |
| **Developer / Triage** | Receives defects, reproduces, classifies severity, fixes/defers. |
| **Sign-off authority** | Reviews results and exit criteria; approves or rejects the build. |

(For a solo capstone, one person may hold several roles; still record results as written evidence.)

## 5. Environment & prerequisites

| Requirement | Value |
|---|---|
| OS | Windows 11 (reference machine) / macOS / Linux |
| Node.js | 20+ (`node -v`) |
| Browser | Microsoft Edge or Google Chrome (Chromium) |
| Ollama | Running locally with `qwen3.5:9b` **and** `nomic-embed-text` pulled — required for **live AI** test cases |
| Network | Localhost only; no internet required except the first CDN load of React/Babel for the UI |

> **Ollama note.** Test cases are tagged **[AI]** (requires Ollama up) or **[Core]** (works with
> Ollama off). The app **must not hang** when Ollama is down — that resilience is itself a test
> case (**TC-15**). On CPU, a `qwen3.5:9b` reply streams token-by-token but is **slow** (tens of
> seconds); this is expected hardware behavior, **not** a defect.

## 6. Test environment setup

Run once per UAT session from the project root (`D:\MCOMP\Capstone\popcorn_language`).

```powershell
# 1. Install dependencies (first time only)
npm install

# 2. Create local env from the tracked template (first time only)
Copy-Item .env.example .env

# 3. Build the database schema
npm run db:migrate

# 4. Seed base catalog (3 NPCs, 2 scenarios, 6 achievements) + the rich demo learner
npm run db:seed
npm run db:seed:demo        # idempotent — safe to re-run to reset the demo account

# 5. (For [AI] cases) confirm the models are present
ollama list                # expect qwen3.5:9b and nomic-embed-text

# 6. Start the app
npm run dev                 # serves API + UI on http://localhost:3100
```

**Verify the environment is healthy before testing:**

1. Open `http://localhost:3100/api/system/health`.
   - Expect `{"server":"up", ...}`.
   - For **[AI]** cases, expect `"ollama": { "reachable": true, "model": "qwen3.5:9b", "modelInstalled": true }`.
   - `"reachable": false` is acceptable for **[Core]**-only sessions.
2. Open `http://localhost:3100/app/main-app.html` — the chat UI should load (CDN React + Babel
   compile in-browser; first load may take a second or two).

**To reset between full passes:** re-run `npm run db:seed:demo` (drops and recreates the `demo`
user and all its data). A deeper reset is available in-app via Settings → System reset (**TC-14**).

## 7. Test data — the `demo` account

`npm run db:seed:demo` creates a single learner whose state every expected result below is keyed to.

| Item | Seeded value |
|---|---|
| **Login** | username `demo` / password `demo` |
| Display name | Demo Learner |
| Profile | Role: *Software engineer* · Goal: *work* · Interests: *coffee, hiking, cats* |
| **Relationships** | **Lily** = *Close friend* (stage 3, 80 pts) · **Mr. Chen** = *Friend* (stage 2, 45 pts) · **Emma** = *Acquaintance* (stage 1, 15 pts) |
| Thread history | Each NPC thread opens with: user "Hi! Good to see you again." → NPC "Hey! Always good to chat with you." |
| **Memory facts (4)** | has_pet=*cat* · works_as=*software engineer* · likes=*hiking* · lives_near=*Clementi* |
| Memory card | "Cat-loving hiker" (linked to Lily) |
| **Completed scenario** | Mock Interview (with Lily) → **Grade A-**, with language/pragmatics/relationship notes |
| **Achievements unlocked (3)** | First Chat · Scenario Survivor · Polite Mode |
| Achievements locked (3) | Three Friends · Bilingual · Streak Week |
| **Streak** | ~6 consecutive days of activity |

## 8. Entry criteria

UAT begins only when **all** of the following hold:

- [ ] The build under test is on `main` and `git status` is clean.
- [ ] `npm run test` passes (developer suite green) and `npm run typecheck` is clean.
- [ ] Environment setup (§6) completed; health endpoint returns `server: up`.
- [ ] Demo data seeded; `demo`/`demo` login confirmed.
- [ ] For **[AI]** cases: Ollama reachable with both models installed.

## 9. Exit criteria (acceptance)

The build is **accepted** when:

- [ ] **100%** of **[Core]** and **[AI]** test cases executed and recorded.
- [ ] **0** open **Critical** or **High** defects.
- [ ] All **Medium** defects are triaged and have an agreed disposition (fix-now / defer-with-reason).
- [ ] **Low** / cosmetic defects are logged for backlog.
- [ ] Sign-off authority approves the results record (§12).

## 10. UAT execution procedure

1. **Prepare** the environment per §6 and confirm entry criteria (§8).
2. **Use a fresh browser context** (new private/incognito window) so no stale `pop_uid` cookie
   leaks between cases. Start each case from the stated precondition.
3. **Execute** each test case (§11) in order, following the steps exactly.
4. **Record** the Actual result and mark **Pass / Fail** in the tracking table (§11.0). Capture a
   screenshot for every executed case; capture console output for any Fail.
5. **Log a defect** (§12) for every Fail, cross-referencing the TC-ID.
6. **(Optional regression aid)** run the headless smoke to corroborate the wiring:
   ```powershell
   npm run smoke:web              # runs all flows; expect "SMOKE PASS"
   # or a single flow: node scripts/smoke-web.mjs chat
   ```
7. **Close out**: confirm exit criteria (§9), compile the results record, obtain sign-off.

## 11. Test cases

Tag legend: **[Core]** = works with Ollama off · **[AI]** = requires Ollama running.
All cases start from `http://localhost:3100/app/...` in a fresh browser context unless noted.

### 11.0 Results tracking table

| TC | Title | Tag | Status (P/F) | Defect ID | Tester / Date |
|----|-------|-----|--------------|-----------|---------------|
| TC-01 | New-user onboarding wizard | Core | | | |
| TC-02 | Login as demo | Core | | | |
| TC-03 | Chat rail shows live relationships | Core | | | |
| TC-04 | Thread history loads | Core | | | |
| TC-05 | Send message → streaming reply | AI | | | |
| TC-06 | Graceful degradation (Ollama down) | Core | | | |
| TC-07 | Grammar correction surfaces | AI | | | |
| TC-08 | Journey: streak & relationships | Core | | | |
| TC-09 | Journey: achievements & memories | Core | | | |
| TC-10 | Scenario: completed summary | Core | | | |
| TC-11 | Scenario: invite → accept → play → grade | AI | | | |
| TC-12 | Settings: change & persist | Core | | | |
| TC-13 | Cross-screen navigation | Core | | | |
| TC-14 | Logout & session re-gate | Core | | | |
| TC-15 | System health & resilience | Core | | | |

---

### TC-01 — New-user onboarding wizard  **[Core]**
**Precondition:** logged out. **Goal:** a brand-new account can be created through the UI.
**Steps:**
1. Open `/app/onboarding-journey.html`.
2. Complete the onboarding wizard: enter a **new** username (e.g. `uat01`), pick a role, a goal,
   and one or more interests; submit.
**Expected:** account is created and onboarding completes; you are taken to the main app
(`main-app.html`) authenticated, with the three seeded NPCs visible in the rail and an empty
chat history for the new user.
**Result:** ☐ Pass ☐ Fail — _notes:_

### TC-02 — Login as demo  **[Core]**
**Precondition:** logged out; demo seeded. **Steps:**
1. Open `/app/onboarding-journey.html` and use the login form: `demo` / `demo`.
**Expected:** login succeeds; the page shows the demo learner's Journey (relationships,
achievements). Navigating to `/app/main-app.html` shows the chat UI authenticated (no redirect
back to onboarding).
**Result:** ☐ Pass ☐ Fail — _notes:_

### TC-03 — Chat rail shows live relationships  **[Core]**
**Precondition:** logged in as demo; on `/app/main-app.html`. **Steps:**
1. Inspect the conversations rail.
**Expected:** ≥3 NPC rows. **Lily** labelled **"Close friend"**, **Mr. Chen** "Friend", **Emma**
"Acquaintance" — these come from `/api/npcs` (the old mock had Lily as "Friend", so "Close friend"
proves live data). Nav rail shows a live streak (~6 days) and conversation count.
**Result:** ☐ Pass ☐ Fail — _notes:_

### TC-04 — Thread history loads  **[Core]**
**Precondition:** logged in as demo; on `/app/main-app.html`. **Steps:**
1. Open Lily's conversation.
**Expected:** prior messages render before any new input — user bubble "Hi! Good to see you
again." and NPC bubble "Hey! Always good to chat with you." (loaded from
`GET /api/threads/lily/messages`, **not** empty).
**Result:** ☐ Pass ☐ Fail — _notes:_

### TC-05 — Send message → streaming reply  **[AI]**
**Precondition:** logged in as demo; Lily open; Ollama up. **Steps:**
1. Type a message (e.g. "Can you recommend a coffee?") and Send (button or Ctrl/⌘+Enter).
**Expected:** the composer disables; your message appears immediately as a user bubble
(`user_message_saved`); a typing indicator shows; the NPC reply **streams in token-by-token**
(slow on CPU is fine); on completion the composer **re-enables**. The reply reflects Lily's
persona (barista). It never hangs.
**Result:** ☐ Pass ☐ Fail — _notes:_

### TC-06 — Graceful degradation when Ollama is down  **[Core]**
**Precondition:** **Stop Ollama** (or set `OLLAMA_BASE_URL` to a dead port and restart dev). Logged
in as demo; Lily open. **Steps:**
1. Send any message.
**Expected:** the user bubble still appears (message saved); instead of a reply, a clear **error
state / message** is shown; the composer **re-enables** so the user can retry. The app does not
freeze, spin forever, or crash. _(Restart Ollama afterwards for [AI] cases.)_
**Result:** ☐ Pass ☐ Fail — _notes:_

### TC-07 — Grammar correction surfaces  **[AI]**
**Precondition:** demo (settings: grammar correction ON); Ollama up; an NPC open. **Steps:**
1. Send a message containing a deliberate grammar error (e.g. "I goes to work yesterday").
**Expected:** alongside the NPC reply, a **correction / suggestion** is presented for the flawed
message (the `correction` SSE event). With grammar correction toggled **off** in Settings, no
correction appears.
**Result:** ☐ Pass ☐ Fail — _notes:_

### TC-08 — Journey: streak & relationships  **[Core]**
**Precondition:** logged in as demo. **Steps:**
1. Open `/app/onboarding-journey.html` (Journey view).
**Expected:** all three relationships shown with correct stages — Lily *Close friend*, Chen
*Friend*, Emma *Acquaintance*; a multi-day streak (~6 days) and conversation counts are displayed
from the live API.
**Result:** ☐ Pass ☐ Fail — _notes:_

### TC-09 — Journey: achievements & memories  **[Core]**
**Precondition:** logged in as demo; on the Journey view. **Steps:**
1. Inspect the achievements and memories sections.
**Expected:** unlocked achievements include **First Chat, Scenario Survivor, Polite Mode**; locked
ones (Three Friends, Bilingual, Streak Week) are shown as not-yet-earned. The memory card
**"Cat-loving hiker"** appears; memory facts reflect cat / software engineer / hiking / Clementi.
**Result:** ☐ Pass ☐ Fail — _notes:_

### TC-10 — Scenario: completed summary  **[Core]**
**Precondition:** logged in as demo. **Steps:**
1. Open `/app/scenario.html`.
**Expected:** the seeded **completed** Mock Interview session renders as a summary card showing
**Grade A-** and the language / pragmatics / relationship notes.
**Result:** ☐ Pass ☐ Fail — _notes:_

### TC-11 — Scenario: invite → accept → play → grade  **[AI]**
**Precondition:** logged in as demo; Ollama up. **Steps:**
1. In chat with **Lily**, steer the conversation toward interview/job topics until a **scenario
   offer** appears (`scenario_offer`), **or** start the offered "Mock Interview".
2. On `/app/scenario.html`, the session shows as **invited** → click **Accept**.
3. Play through the turns by selecting offered **choices**; observe state updates each turn.
4. Continue until the scenario **ends** and a graded summary is produced.
**Expected:** accept transitions invited→active; each choice streams an NPC turn and updates state
(impression/stress/turns-left); at the end a grade + notes summary is shown. (Decline on an
invited session is an alternative path — it should close the invite gracefully.)
**Result:** ☐ Pass ☐ Fail — _notes:_

### TC-12 — Settings: change & persist  **[Core]**
**Precondition:** logged in as demo. **Steps:**
1. Open Settings; change the **memory strategy** (e.g. hybrid → semantic) and toggle **grammar
   correction**; save.
2. Reload the page.
**Expected:** changes persist across reload (read back from `GET /api/settings`). The model name
field shows `qwen3.5:9b`.
**Result:** ☐ Pass ☐ Fail — _notes:_

### TC-13 — Cross-screen navigation  **[Core]**
**Precondition:** logged in as demo. **Steps:**
1. From each screen, use the bottom-right dock to move between Main app ↔ Onboarding/Journey ↔
   Scenario.
**Expected:** all links navigate to the correct same-origin page; the session persists (no
re-login); each target renders its live data.
**Result:** ☐ Pass ☐ Fail — _notes:_

### TC-14 — Logout & session re-gate  **[Core]**
**Precondition:** logged in as demo. **Steps:**
1. Log out (or clear the `pop_uid` cookie). 2. Navigate to `/app/main-app.html`.
**Expected:** an unauthenticated visit to the main app **redirects to onboarding** (the auth gate);
protected `/api/*` calls return 401. After logging back in, access is restored.
**Result:** ☐ Pass ☐ Fail — _notes:_

### TC-15 — System health & resilience  **[Core]**
**Precondition:** dev server running. **Steps:**
1. Open `/api/system/health` with Ollama **up**, then with Ollama **down**.
**Expected:** `server: up` in both; `ollama.reachable` flips `true`/`false` accordingly with
`model: qwen3.5:9b`. The UI keeps loading and the app stays usable for non-AI actions when Ollama
is down (corroborates TC-06).
**Result:** ☐ Pass ☐ Fail — _notes:_

## 12. Defect logging & severity

Log every Fail with this template:

```
Defect ID:     UAT-DEF-NNN
Linked TC:     TC-NN
Title:         <one line>
Environment:   build eceedc5 · Ollama up/down · browser/version
Severity:      Critical | High | Medium | Low
Steps:         <numbered, reproducible>
Expected:      <from the test case>
Actual:        <what happened>
Evidence:      <screenshot / console log file>
```

**Severity definitions:**

| Severity | Definition | Example |
|---|---|---|
| **Critical** | Core workflow unusable; data loss; app hang/crash | Chat composer permanently stuck; login impossible |
| **High** | Major feature broken, no workaround | Thread history never loads; scenario can't be accepted |
| **Medium** | Feature works with a workaround, or wrong-but-recoverable data | Relationship stage label wrong; achievement mis-flagged |
| **Low** | Cosmetic / minor | Spacing, wording, non-blocking visual glitch |

## 13. Known by-design behaviors (NOT defects)

Do **not** raise these — they are intentional and documented:

- **Minimal auth** — plaintext password, single-query login, `pop_uid` cookie, no
  bcrypt/Auth.js/CSRF. Local-demo design; never deployed. The demo seed sets password = username
  on purpose.
- **Slow replies on CPU** — `qwen3.5:9b` streams but is slow on CPU; the UI shows tokens
  progressively and never blocks. This is hardware, not a bug.
- **No build step** — the UI loads React + Babel from CDN and compiles JSX in the browser; the
  first paint may lag slightly.
- **`reachable: false` in health** when Ollama is off is expected and does not block the app.
- **EOL churn** — `docs/reports/memory-ablation.md` may show as modified after `npm test` (a
  deterministic LF rewrite); harmless, restore with `git checkout --`.

## 14. Sign-off

| | Name | Decision (Accept / Reject) | Date | Signature |
|---|---|---|---|---|
| UAT Tester | | | | |
| Facilitator | | | | |
| Sign-off authority | | | | |

**Summary:** ____ / 15 cases passed · Critical/High open: ____ · Disposition: ____________________
