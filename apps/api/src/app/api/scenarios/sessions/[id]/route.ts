// src/app/api/scenarios/sessions/[id]/route.ts
import { SessionDetailResponse } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { mapSessionDetail } from '@/server/scenario/sessionView';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const session = await prisma.scenarioSession.findFirst({
      where: { id: params.id, userId },
      include: { template: true, summary: true },
    });
    if (!session) return errorJson(404, 'NOT_FOUND', 'Scenario session not found');

    const messages = await prisma.message.findMany({
      where: { scenarioSessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });
    const out: SessionDetailResponse = mapSessionDetail(session, messages);
    return json(out);
  });
}
