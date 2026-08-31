import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';

export function mountStaticApp(app: Hono, staticDir: string): void {
  const indexPath = path.join(staticDir, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(`Web build not found at ${indexPath}. Run "npm run build:web" first.`);
  }

  const serveAsset = serveStatic({ root: staticDir });
  app.use('/assets/*', async (c, next) => {
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
    return serveAsset(c, next);
  });

  const serveIndex = serveStatic({
    root: staticDir,
    path: 'index.html',
  });

  app.get('*', async (c, next) => {
    const requestPath = c.req.path;
    if (requestPath.startsWith('/api/') || requestPath.startsWith('/assets/') || path.posix.extname(requestPath)) {
      return next();
    }
    c.header('Cache-Control', 'no-cache');
    return serveIndex(c, next);
  });
}
