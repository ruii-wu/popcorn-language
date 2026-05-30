// scripts/smoke-web.mjs — headless browser smoke for the wired web client.
// Drives the installed Microsoft Edge (channel: 'msedge') against a running dev
// server on :3100. Proves the UI renders values from the live API (not the old
// mock constants) and degrades gracefully when Ollama is down.
//
// Usage:  node scripts/smoke-web.mjs <flow>     flow ∈ api|chat|journey|scenario|all
// Pre-req: `npm run dev` is up on :3100, and `npm run db:seed:demo` has been run.
import { chromium } from 'playwright';

const BASE = 'http://localhost:3100';
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

async function gotoApp(page, file) {
  await page.goto(`${BASE}/app/${file}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.API, null, { timeout: 15000 });
}

// Authenticate at the context level (sets the pop_uid cookie) BEFORE loading any app
// page, so the page renders already-authed — no first-load 401/redirect race.
async function login(page, u, p) {
  const r = await page.context().request.post(`${BASE}/api/auth/login`, { data: { username: u, password: p } });
  if (!r.ok()) throw new Error('login failed: ' + r.status());
}

async function flowApi(browser) {
  console.log('[api] window.API wiring + same-origin reach');
  const page = await newPage(browser);
  await gotoApp(page, 'main-app.html');
  const shape = await page.evaluate(() =>
    typeof window.API === 'object' && typeof window.API.streamMessage === 'function');
  assert(shape, 'window.API exposes streamMessage');
  const me = await page.evaluate(async () => {
    try { const u = await window.API.me(); return 'user:' + (u.user ? u.user.username : '?'); }
    catch (e) { return 'status:' + e.status; }
  });
  assert(me.startsWith('user:') || me === 'status:401',
    'API.me() reaches /api same-origin (got ' + me + ')');
}

async function flowChat(browser) {
  console.log('[chat] rail + thread + streaming send from live API');
  const page = await newPage(browser);
  await login(page, 'demo', 'demo');
  await gotoApp(page, 'main-app.html');

  // The conversations rail renders one <button> per NPC with the relationship label.
  // Seeded demo: Lily = Close friend (stage 3). Mock NPCS_WEB has Lily = Friend (2),
  // so "Lily … Close friend" only appears when the rail reads /api/npcs.
  const lilyBtn = page.locator('button', { hasText: 'Lily' }).first();
  await lilyBtn.waitFor({ timeout: 15000 });
  const lilyText = (await lilyBtn.innerText()).replace(/\s+/g, ' ');
  assert(/Close friend/i.test(lilyText), 'Lily row shows API stage "Close friend" (got: ' + lilyText.slice(0, 60) + ')');

  const npcCount = await page.locator('button', { hasText: /Lily|Emma|Chen/ }).count();
  assert(npcCount >= 3, 'rail lists ≥3 NPCs from API (got ' + npcCount + ')');

  // Send a message; Ollama may be up or down. Assert the user bubble appears and the
  // composer re-enables (never stuck). If Ollama is down, an error bubble appears.
  const box = page.locator('textarea');
  await box.fill('hello from smoke');
  await page.locator('button', { hasText: 'Send' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('hello from smoke'),
    null, { timeout: 15000 });
  ok('user message bubble rendered (user_message_saved)');
  // composer re-enabled within 30s (covers Ollama-down error path and a short real reply)
  try {
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Send/.test(x.textContent));
      return b && !b.disabled;
    }, null, { timeout: 30000 });
    ok('composer re-enabled after send (no hang)');
  } catch { fail('composer stayed disabled after send'); }
}

async function flowJourney(browser) {
  console.log('[journey] onboarding page renders live journey for demo');
  const page = await newPage(browser);
  await login(page, 'demo', 'demo');
  await gotoApp(page, 'onboarding-journey.html');
  await page.waitForTimeout(3000); // allow in-browser Babel + fetches
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  assert(/Lily/.test(body), 'journey view mentions Lily (seeded relationship)');
}

async function flowScenario(browser) {
  console.log('[scenario] scenario page renders the seeded completed session');
  const page = await newPage(browser);
  await login(page, 'demo', 'demo');
  await gotoApp(page, 'scenario.html');
  await page.waitForTimeout(3000);
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
