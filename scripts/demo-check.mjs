import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';

dotenv.config({ path: 'apps/api/.env', quiet: true });

const webUrl = process.env.DEMO_WEB_URL ?? 'http://localhost:5173';
const apiUrl = process.env.DEMO_API_URL ?? 'http://localhost:3100';
const ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const chatModel = process.env.OLLAMA_CHAT_MODEL ?? 'qwen3.5:9b';
const embedModel = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';
const checks = [];

function pass(name, detail) {
  checks.push({ level: 'PASS', name, detail });
}

function fail(name, detail) {
  checks.push({ level: 'FAIL', name, detail });
}

function warn(name, detail) {
  checks.push({ level: 'WARN', name, detail });
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function modelInstalled(names, required) {
  return names.some((name) => name === required || name.startsWith(`${required}:`));
}

const requiredNode = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim().replace(/^v/, '');
if (process.versions.node === requiredNode) pass('Node.js', process.version);
else fail('Node.js', `${process.version}; run "nvm use" in the repository (v${requiredNode} required)`);

try {
  const response = await fetch(webUrl, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  pass('Web', webUrl);
} catch (error) {
  fail('Web', `${webUrl} is unavailable (${error.message})`);
}

try {
  const health = await getJson(`${apiUrl}/api/system/health`);
  if (health?.server !== 'up') throw new Error('unexpected health response');
  pass('API', apiUrl);
} catch (error) {
  fail('API', `${apiUrl} is unavailable (${error.message})`);
}

const migration = spawnSync(
  'npm',
  ['exec', '-w', 'apps/api', '--', 'prisma', 'migrate', 'status'],
  { encoding: 'utf8' },
);
if (migration.status === 0 && migration.stdout.includes('Database schema is up to date')) {
  pass('SQLite migrations', 'database schema is up to date');
} else {
  const detail = (migration.stderr || migration.stdout || 'migration status failed').trim().split('\n').at(-1);
  fail('SQLite migrations', detail);
}

try {
  const tags = await getJson(`${ollamaUrl}/api/tags`);
  const names = Array.isArray(tags?.models) ? tags.models.map((model) => model.name) : [];
  pass('Ollama', ollamaUrl);
  if (modelInstalled(names, chatModel)) pass('Chat model', chatModel);
  else fail('Chat model', `${chatModel} is not installed; run "ollama pull ${chatModel}"`);
  if (modelInstalled(names, embedModel)) pass('Embedding model', embedModel);
  else fail('Embedding model', `${embedModel} is not installed; run "ollama pull ${embedModel}"`);

  try {
    const running = await getJson(`${ollamaUrl}/api/ps`);
    const loaded = Array.isArray(running?.models) ? running.models.map((model) => model.name) : [];
    if (modelInstalled(loaded, chatModel)) pass('Model warm state', `${chatModel} is loaded`);
    else warn('Model warm state', `${chatModel} is installed but cold; the first response may be slower`);
  } catch {
    warn('Model warm state', 'Ollama did not expose /api/ps');
  }
} catch (error) {
  fail('Ollama', `${ollamaUrl} is unavailable (${error.message})`);
}

console.log('\nPopcorn demo readiness\n');
for (const check of checks) {
  console.log(`[${check.level}] ${check.name}: ${check.detail}`);
}

const failures = checks.filter((check) => check.level === 'FAIL').length;
console.log(`\n${failures === 0 ? 'Ready for demo.' : `Not ready: ${failures} required check(s) failed.`}\n`);
if (failures > 0) process.exitCode = 1;
