// src/app/api/settings/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { readSettings, writeSettings, SettingsPatch } from '@/server/settings/settings';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => json(await readSettings(prisma, userId)));
}

export async function PUT(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const parsed = SettingsPatch.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'invalid settings payload');
    const settings = await writeSettings(prisma, userId, parsed.data);
    return json({ ok: true, settings });
  });
}
