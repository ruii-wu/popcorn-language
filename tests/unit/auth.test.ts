import { describe, it, expect } from 'vitest';
import { SESSION_COOKIE, serializeSessionCookie, clearSessionCookie, parseUserIdFromCookieHeader } from '@/server/auth/session';
import { requireUser, getUserId, UnauthorizedError } from '@/server/auth/requireUser';

function reqWithCookie(cookie: string | null): Request {
  return new Request('http://localhost/api/x', { headers: cookie ? { cookie } : {} });
}

describe('session cookie', () => {
  it('round-trips a userId', () => {
    const setCookie = serializeSessionCookie('user_123');
    expect(setCookie).toContain(`${SESSION_COOKIE}=user_123`);
    expect(setCookie).toContain('HttpOnly');
    const header = `other=1; ${SESSION_COOKIE}=user_123; foo=bar`;
    expect(parseUserIdFromCookieHeader(header)).toBe('user_123');
  });

  it('returns null when cookie missing', () => {
    expect(parseUserIdFromCookieHeader(null)).toBeNull();
    expect(parseUserIdFromCookieHeader('other=1')).toBeNull();
  });

  it('clear cookie has Max-Age=0', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });
});

describe('requireUser', () => {
  it('returns userId when cookie present', () => {
    expect(getUserId(reqWithCookie(`${SESSION_COOKIE}=user_9`))).toBe('user_9');
    expect(requireUser(reqWithCookie(`${SESSION_COOKIE}=user_9`))).toEqual({ userId: 'user_9' });
  });

  it('throws UnauthorizedError when missing', () => {
    expect(() => requireUser(reqWithCookie(null))).toThrow(UnauthorizedError);
  });
});
