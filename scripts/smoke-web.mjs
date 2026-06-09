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
  const rootText = await page.locator('#root').innerText();
  assert(rootText.trim().length > 0, 'main route ("/") rendered content into #root');
}

async function flowChat(browser) {
  console.log('[chat] rail + thread + streaming send from live API');
  const page = await newPage(browser);
  await login(page, 'demo', 'demo');
  await gotoRoute(page, '/');

  const lilyBtn = page.locator('button', { hasText: 'Lily' }).first();
  await lilyBtn.waitFor({ timeout: 15000 });
  const lilyText = (await lilyBtn.innerText()).replace(/\s+/g, ' ');
  assert(/Close friend/i.test(lilyText), 'Lily row shows API stage "Close friend" (got: ' + lilyText.slice(0, 60) + ')');

  const npcCount = await page.locator('button', { hasText: /Lily|Emma|Chen/ }).count();
  assert(npcCount >= 3, 'rail lists >=3 NPCs from API (got ' + npcCount + ')');

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
  await page.waitForTimeout(2000);
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
