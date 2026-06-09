import { describe, it, expect } from 'vitest';
import { app } from '@/http/app';

// The complete expected mounting table (34 route files -> 37 method-routes).
const EXPECTED: [string, string][] = [
  ['POST', '/api/auth/login'],
  ['POST', '/api/auth/logout'],
  ['POST', '/api/auth/register'],
  ['GET', '/api/auth/me'],
  ['GET', '/api/profile'],
  ['PUT', '/api/profile'],
  ['POST', '/api/onboarding/complete'],
  ['GET', '/api/npcs'],
  ['GET', '/api/npcs/:id'],
  ['DELETE', '/api/threads/:npcId'],
  ['GET', '/api/threads/:npcId/messages'],
  ['POST', '/api/threads/:npcId/messages'],
  ['POST', '/api/threads/:npcId/messages/:msgId/correction'],
  ['GET', '/api/scenarios/catalog'],
  ['GET', '/api/scenarios/sessions'],
  ['GET', '/api/scenarios/sessions/:id'],
  ['POST', '/api/scenarios/sessions/:id/accept'],
  ['POST', '/api/scenarios/sessions/:id/decline'],
  ['POST', '/api/scenarios/sessions/:id/choose'],
  ['POST', '/api/scenarios/sessions/:id/freetype'],
  ['POST', '/api/scenarios/sessions/:id/abort'],
  ['POST', '/api/scenarios/sessions/:id/pause'],
  ['POST', '/api/scenarios/sessions/:id/resume'],
  ['GET', '/api/memories'],
  ['GET', '/api/memories/recent'],
  ['DELETE', '/api/memories/:id'],
  ['GET', '/api/journey/summary'],
  ['GET', '/api/journey/relationships'],
  ['GET', '/api/journey/streak'],
  ['GET', '/api/achievements'],
  ['POST', '/api/achievements/generate'],
  ['GET', '/api/settings'],
  ['PUT', '/api/settings'],
  ['GET', '/api/system/health'],
  ['GET', '/api/system/models'],
  ['POST', '/api/system/reset'],
  ['POST', '/api/dev/memory-eval'],
];

describe('Hono app', () => {
  it('mounts every expected route at the right method + path', () => {
    expect(EXPECTED).toHaveLength(37);
    const have = new Set(app.routes.map((r) => `${r.method} ${r.path}`));
    const missing = EXPECTED.filter(([m, p]) => !have.has(`${m} ${p}`));
    expect(missing).toEqual([]);
  });

  it('401s a protected route called without a cookie', async () => {
    const res = await app.request('/api/npcs');
    expect(res.status).toBe(401);
  });

  it('404s an unknown path', async () => {
    const res = await app.request('/api/nope');
    expect(res.status).toBe(404);
  });
});
