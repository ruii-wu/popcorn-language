import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { registerAccount, UsernameTakenError } from '@/server/auth/accounts';
import { serializeSessionCookie } from '@/server/auth/session';
import { errorJson } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

const Body = z.object({ username: z.string().min(1), password: z.string().min(1) });

export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'username and password required');
  try {
    const { userId } = await registerAccount(prisma, parsed.data);
    return Response.json({ userId }, { headers: { 'Set-Cookie': serializeSessionCookie(userId) } });
  } catch (e) {
    if (e instanceof UsernameTakenError) return errorJson(409, 'USERNAME_TAKEN', 'Username already taken');
    throw e;
  }
}
