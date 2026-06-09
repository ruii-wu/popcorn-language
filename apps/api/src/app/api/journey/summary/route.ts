// src/app/api/journey/summary/route.ts
import { JourneySummaryResponse } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';
import { computeStreak } from '@/server/users/streak';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const events = await prisma.activityEvent.findMany({
      where: { userId, type: 'message_sent' },
      select: { createdAt: true },
    });
    const { days } = computeStreak(events.map((e) => e.createdAt));

    const [conversations, scenarios, memories] = await Promise.all([
      prisma.message.count({ where: { userId } }),
      prisma.scenarioSession.count({ where: { userId, status: 'completed' } }),
      prisma.memory.count({ where: { userId } }),
    ]);

    const out: JourneySummaryResponse = { days, conversations, scenarios, memories };
    return json(out);
  });
}
