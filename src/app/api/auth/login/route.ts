import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { loginAccount } from '@/server/auth/accounts';
import { serializeSessionCookie } from '@/server/auth/session';
import { errorJson } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

const Body = z.object({ username: z.string().min(1), password: z.string().min(1) });

export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'username and password required');
  const result = await loginAccount(prisma, parsed.data);
  if (!result) return errorJson(401, 'INVALID_CREDENTIALS', 'Wrong username or password');
  return Response.json({ userId: result.userId }, { headers: { 'Set-Cookie': serializeSessionCookie(result.userId) } });
}
