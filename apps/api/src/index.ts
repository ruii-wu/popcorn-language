import 'dotenv/config'; // load apps/api/.env (DATABASE_URL, OLLAMA_*) for the non-Next runtime
import { serve } from '@hono/node-server';
import path from 'node:path';
import { app } from './http/app';
import { mountStaticApp } from './http/staticApp';

const port = Number(process.env.PORT ?? 3100);
const configuredStaticDir = process.env.APP_STATIC_DIR;
if (configuredStaticDir) {
  const staticDir = path.isAbsolute(configuredStaticDir)
    ? configuredStaticDir
    : path.resolve(process.cwd(), configuredStaticDir);
  mountStaticApp(app, staticDir);
}

serve({ fetch: app.fetch, port }, (info) => {
  const mode = configuredStaticDir ? 'Popcorn app' : 'API';
  console.log(`${mode} on http://localhost:${info.port}`);
});
