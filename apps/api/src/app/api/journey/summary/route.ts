// src/app/api/journey/summary/route.ts
import { JourneySummaryResponse } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';
import { computeStreak } from '@/server/users/streak';
import { visibleUserMessageWhere } from '@/server/users/visibleActivity';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const [messages, scenarios, memories] = await Promise.all([
      prisma.message.findMany({
        where: visibleUserMessageWhere(userId),
        select: { createdAt: true },
      }),
      prisma.scenarioSession.count({ where: { userId, status: 'completed', hiddenAt: null } }),
      prisma.memory.count({ where: { userId } }),
    ]);
    const { days } = computeStreak(messages.map((message) => message.createdAt));

    const out: JourneySummaryResponse = { days, practiceTurns: messages.length, scenarios, memories };
    return json(out);
  });
}
