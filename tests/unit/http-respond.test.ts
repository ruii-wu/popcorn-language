import { describe, it, expect } from 'vitest';
import { json, errorJson, withUser } from '@/server/http/respond';
import { SESSION_COOKIE } from '@/server/auth/session';

describe('respond helpers', () => {
  it('json sets status and body', async () => {
    const res = json({ a: 1 }, { status: 201 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ a: 1 });
  });

  it('errorJson wraps code/message', async () => {
    const res = errorJson(404, 'NOT_FOUND', 'nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'nope' } });
  });

  it('withUser returns 401 when no cookie', async () => {
    const res = await withUser(new Request('http://x/'), async () => json({ ok: true }));
    expect(res.status).toBe(401);
  });

  it('withUser passes userId to fn when cookie present', async () => {
    const req = new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=u1` } });
    const res = await withUser(req, async (userId) => json({ userId }));
    expect(await res.json()).toEqual({ userId: 'u1' });
  });
});
