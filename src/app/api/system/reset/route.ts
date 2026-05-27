// src/app/api/system/reset/route.ts
import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { resetUserData } from '@/server/users/reset';

export const dynamic = 'force-dynamic';

const Body = z.object({ confirm: z.literal(true) });

export async function POST(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(400, 'CONFIRM_REQUIRED', 'reset requires { confirm: true }');
    await resetUserData(prisma, userId);
    return json({ ok: true });
  });
}
