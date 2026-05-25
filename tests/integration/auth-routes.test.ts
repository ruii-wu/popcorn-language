import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST as register } from '@/app/api/auth/register/route';
import { POST as login } from '@/app/api/auth/login/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w2_authroutes_user__';
const body = (obj: unknown) => new Request('http://x/', { method: 'POST', body: JSON.stringify(obj) });

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('auth routes', () => {
  it('register sets a session cookie and returns userId', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const res = await register(body({ username: U, password: 'pw' }));
    expect(res.status).toBe(200);
    const { userId } = await res.json();
    expect(userId).toBeTruthy();
    expect(res.headers.get('Set-Cookie')).toContain(`${SESSION_COOKIE}=${userId}`);
  });

  it('register rejects a duplicate username with 409', async () => {
    const res = await register(body({ username: U, password: 'pw' }));
    expect(res.status).toBe(409);
  });

  it('register 400s on a missing field', async () => {
    expect((await register(body({ username: U }))).status).toBe(400);
  });

  it('login returns userId + cookie on correct password, 401 otherwise', async () => {
    const ok = await login(body({ username: U, password: 'pw' }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Set-Cookie')).toContain(SESSION_COOKIE);
    expect((await login(body({ username: U, password: 'no' }))).status).toBe(401);
  });
});
