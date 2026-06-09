// src/app/api/settings/route.ts
import { SettingsResponse, SettingsPatch } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { readSettings, writeSettings } from '@/server/settings/settings';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const out: SettingsResponse = await readSettings(prisma, userId);
    return json(out);
  });
}

export async function PUT(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const parsed = SettingsPatch.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'invalid settings payload');
    const settings = await writeSettings(prisma, userId, parsed.data);
    return json({ ok: true, settings });
  });
}
