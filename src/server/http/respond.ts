import { requireUser } from '@/server/auth/requireUser';

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function errorJson(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function withUser(
  req: Request,
  fn: (userId: string) => Promise<Response>,
): Promise<Response> {
  let userId: string;
  try {
    userId = requireUser(req).userId;
  } catch {
    return errorJson(401, 'UNAUTHORIZED', 'Sign in required');
  }
  return fn(userId);
}
