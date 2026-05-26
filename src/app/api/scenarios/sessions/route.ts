// src/app/api/scenarios/sessions/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';
import { mapSessionListItem } from '@/server/scenario/sessionView';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const url = new URL(req.url);
    const npcId = url.searchParams.get('npcId') ?? undefined;
    const status = url.searchParams.get('status') ?? undefined;

    const rows = await prisma.scenarioSession.findMany({
      where: { userId, ...(npcId ? { npcId } : {}), ...(status ? { status } : {}) },
      include: { template: true, summary: true },
      orderBy: { invitedAt: 'desc' },
    });
    return json(rows.map(mapSessionListItem));
  });
}
