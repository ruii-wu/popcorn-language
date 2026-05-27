// tests/integration/system-models-route.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { GET } from '@/app/api/system/models/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const withUid = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => { vi.unstubAllGlobals(); });

describe('GET /api/system/models', () => {
  it('401s without a cookie', async () => {
    expect((await GET(new Request('http://x/'))).status).toBe(401);
  });

  it('returns the local model list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/api/tags')) return ok({ models: [{ name: 'qwen2.5:7b-instruct', size: 4_700_000_000 }] });
      if (u.includes('/api/ps')) return ok({ models: [] });
      throw new Error(`unexpected ${u}`);
    }));
    const res = await GET(withUid('u_models'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ name: 'qwen2.5:7b-instruct', sizeGB: 4.7, loaded: false }]);
  });
});
