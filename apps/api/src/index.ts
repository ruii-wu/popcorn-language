import 'dotenv/config'; // load apps/api/.env (DATABASE_URL, OLLAMA_*) for the non-Next runtime
import { serve } from '@hono/node-server';
import { app } from './http/app';

const port = 3100;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API on http://localhost:${info.port}`);
});
