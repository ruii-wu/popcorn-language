import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'popcorn-scoring-'));
const env = { ...process.env, DATABASE_URL: `file:${join(temporary, 'evaluation.db')}`, SCORING_EVAL_ISOLATED: '1' };
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const logs = [];
function run(args) {
  const result = spawnSync(npm, args, { cwd: root, env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  logs.push(`$ npm ${args.join(' ')}\n${output}`);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} failed (${result.status})`);
}
try {
  run(['run', 'predb:migrate', '-w', 'apps/api']);
  run(['exec', '-w', 'apps/api', '--', 'prisma', 'migrate', 'deploy']);
  run(['run', 'db:seed', '-w', 'apps/api']);
  if (process.argv.includes('--test')) run(['run', 'test:api']);
  run(['exec', '-w', 'apps/api', '--', 'tsx', 'scripts/recommendation-sensitivity.ts']);
} finally {
  rmSync(temporary, { recursive: true, force: true });
  const outDir = resolve(root, 'docs/reports/data');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'recommendation-sensitivity-run.log'), logs.join('\n'));
}
