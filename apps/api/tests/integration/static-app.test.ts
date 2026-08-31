import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { mountStaticApp } from '@/http/staticApp';

const staticDir = mkdtempSync(path.join(tmpdir(), 'popcorn-static-'));
mkdirSync(path.join(staticDir, 'assets'));
writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>Popcorn test</title>');
writeFileSync(path.join(staticDir, 'assets', 'app.js'), 'console.log("ok")');

afterAll(() => rmSync(staticDir, { recursive: true, force: true }));

function testApp() {
  const app = new Hono();
  app.get('/api/health', (c) => c.json({ ok: true }));
  mountStaticApp(app, staticDir);
  return app;
}

describe('single-port static app', () => {
  it('serves built assets with immutable caching and the correct content type', async () => {
    const response = await testApp().request('/assets/app.js');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/javascript');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('falls back to index.html for SPA routes', async () => {
    const response = await testApp().request('/settings');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(await response.text()).toContain('Popcorn test');
  });

  it('does not turn missing API or asset paths into the SPA document', async () => {
    expect((await testApp().request('/api/nope')).status).toBe(404);
    expect((await testApp().request('/assets/missing.js')).status).toBe(404);
  });
});
