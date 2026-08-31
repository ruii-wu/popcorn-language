import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expected = readFileSync(path.join(root, '.nvmrc'), 'utf8').trim().replace(/^v/, '');
const actual = process.versions.node;

if (actual !== expected) {
  console.error(`Node ${expected} is required; current runtime is ${actual}.`);
  console.error('Install a Node version manager, then run "nvm install" and "nvm use" in this repository.');
  process.exit(1);
}

console.log(`Node version OK: v${actual}`);
