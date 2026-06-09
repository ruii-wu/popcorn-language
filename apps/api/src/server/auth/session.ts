export const SESSION_COOKIE = 'pop_uid';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function serializeSessionCookie(userId: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(userId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export function parseUserIdFromCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key === SESSION_COOKIE) {
      const val = decodeURIComponent(part.slice(idx + 1).trim());
      return val || null;
    }
  }
  return null;
}
