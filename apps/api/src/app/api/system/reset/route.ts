// src/app/api/system/reset/route.ts
import { SystemResetBody } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { resetUserData } from '@/server/users/reset';

export async function POST(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const parsed = SystemResetBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(400, 'CONFIRM_REQUIRED', 'reset requires { confirm: true }');
    await resetUserData(prisma, userId);
    return json({ ok: true });
  });
}
