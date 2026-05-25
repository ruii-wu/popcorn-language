import { clearSessionCookie } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
}
