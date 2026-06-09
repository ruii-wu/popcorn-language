import { clearSessionCookie } from '@/server/auth/session';

export async function POST(): Promise<Response> {
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
}
