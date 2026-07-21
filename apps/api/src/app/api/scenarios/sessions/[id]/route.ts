// src/app/api/scenarios/sessions/[id]/route.ts
import { SessionDetailResponse } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { mapSessionDetail } from '@/server/scenario/sessionView';

export async function GET(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const session = await prisma.scenarioSession.findFirst({
      where: { id: params.id, userId },
      include: { template: true, summary: true },
    });
    if (!session) return errorJson(404, 'NOT_FOUND', 'Scenario session not found');

    const [messages, latestTurn] = await Promise.all([
      prisma.message.findMany({
        where: { scenarioSessionId: session.id, hiddenAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.scenarioTurn.findFirst({
        where: { sessionId: session.id },
        orderBy: { turnIndex: 'desc' },
        select: { nextChoices: true },
      }),
    ]);
    const out: SessionDetailResponse = mapSessionDetail(session, messages, latestTurn?.nextChoices);
    return json(out);
  });
}
