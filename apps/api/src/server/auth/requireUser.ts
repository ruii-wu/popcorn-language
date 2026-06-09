import { parseUserIdFromCookieHeader } from './session';

export class UnauthorizedError extends Error {
  constructor() { super('Unauthorized'); this.name = 'UnauthorizedError'; }
}

export function getUserId(req: Request): string | null {
  return parseUserIdFromCookieHeader(req.headers.get('cookie'));
}

export function requireUser(req: Request): { userId: string } {
  const userId = getUserId(req);
  if (!userId) throw new UnauthorizedError();
  return { userId };
}
