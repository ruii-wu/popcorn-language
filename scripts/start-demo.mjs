import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const staticDir = path.join(root, 'apps', 'web', 'dist');
if (!existsSync(path.join(staticDir, 'index.html'))) {
  console.error('Web build is missing. Run "npm run build:web" first.');
  process.exit(1);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npm, ['run', 'start', '-w', 'apps/api'], {
  cwd: root,
  env: {
    ...process.env,
    APP_STATIC_DIR: staticDir,
    PORT: process.env.PORT ?? '3100',
    NODE_ENV: 'production',
  },
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

const exitCode = await new Promise((resolve) => {
  child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
});
process.exitCode = exitCode;
