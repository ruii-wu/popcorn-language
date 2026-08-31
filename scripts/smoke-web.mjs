// scripts/smoke-web.mjs — headless browser smoke for the Vite web client.
// Drives an installed Chromium browser against a running web endpoint.
// Defaults to Vite on :5173; set DEMO_WEB_URL=http://localhost:3100 for single-port demo mode.
// Proves the UI renders values from the live API and degrades gracefully when Ollama is down.
//
// Usage:  node scripts/smoke-web.mjs <flow>     flow in api|chat|journey|scenario|all
// Pre-req: `npm run dev` is up (API :3100 + Vite :5173), and `npm run db:seed:demo` has run.
import { chromium } from 'playwright';

const BASE = process.env.DEMO_WEB_URL ?? 'http://localhost:5173';
const BROWSER_CHANNEL = process.env.DEMO_BROWSER_CHANNEL;
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

  // non-Lily NPC drives the right panel — Chen's own per-NPC fact, not hardcoded Lily
  await page.locator('button', { hasText: 'Chen' }).first().click();
  const showsChen = await page.waitForFunction(
    () => document.body.innerText.includes('grow into a tech lead'), null, { timeout: 10000 }).then(() => true).catch(() => false);
  assert(showsChen, "selecting Mr. Chen renders HIS per-NPC facts in the right panel (not hardcoded Lily)");

  // ---- inline scenario: invitation renders in the SAME conversation (no new page) ----
  await page.locator('button', { hasText: 'Lily' }).first().click();
  // warm up the thread + name the topic so judgeScenarioTrigger fires.
  // Guarded: if Lily already has an active/invited scenario the text composer is hidden —
  // skip the send rather than crash, and let the assertions below report the real state.
  for (const line of ['I have a job interview tomorrow', 'can we practice', 'let us do a mock interview']) {
    if (await box.count() === 0) break; // composer replaced by choice cards — already in a scenario
    await box.fill(line).catch(() => {});
    await page.locator('button', { hasText: 'Send' }).click().catch(() => {});
    await page.waitForFunction((t) => document.body.innerText.includes(t), line.slice(0, 12), { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Send/.test(x.textContent));
      return b && !b.disabled;
    }, null, { timeout: 30000 }).catch(() => {});
  }
  const invited = await page.waitForFunction(
    () => /Scenario invitation|Yeah, let's do it/i.test(document.body.innerText),
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

    // ---- exit: End aborts back to casual chat ----
    const endBtn = page.getByRole('button', { name: /^(End|End roleplay)$/i }).first();
    const hasEnd = await endBtn.count() > 0;
    assert(hasEnd, 'roleplay shows an End button (exit exists)');
    if (hasEnd) {
      page.once('dialog', (dialog) => dialog.accept());
      await endBtn.click();
      const backToCasual = await page.waitForFunction(
        () => !/Choose your response/i.test(document.body.innerText) && !!document.querySelector('textarea'),
        null, { timeout: 15000 }).then(() => true).catch(() => false);
      assert(backToCasual, 'ending the roleplay returns to casual chat (text composer, no choice cards)');
    }
  } else {
    ok('accept button not present (offer may not have fired this run) — skipped accept assertion');
  }
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
  console.log('[scenario] /scenario redirects to / (inline experience)');
  const page = await newPage(browser);
  await login(page, 'demo', 'demo');
  await gotoRoute(page, '/scenario');
  await page.waitForTimeout(1000);
  const url = page.url();
  assert(!url.includes('/scenario'), '/scenario redirected away from /scenario');
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  assert(/Lily|Chen|Emma/i.test(body), 'redirected view shows an NPC name');
}

const FLOWS = { api: flowApi, chat: flowChat, journey: flowJourney, scenario: flowScenario };

async function launchBrowser() {
  const candidates = BROWSER_CHANNEL ? [BROWSER_CHANNEL] : ['chrome', 'msedge', null];
  const failures = [];
  for (const channel of candidates) {
    try {
      return await chromium.launch(channel ? { channel, headless: true } : { headless: true });
    } catch (error) {
      failures.push(`${channel ?? 'playwright-chromium'}: ${error.message.split('\n')[0]}`);
    }
  }
  throw new Error(`No Chromium browser could be launched. ${failures.join(' | ')}`);
}

const browser = await launchBrowser();
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
