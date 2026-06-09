// src/app/api/journey/streak/route.ts
import { StreakResponse } from '@popcorn/shared';
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
    const { days, weekCount, perDay } = computeStreak(events.map((e) => e.createdAt));
    const out: StreakResponse = { days, weekCount, perDay };
    return json(out);
  });
}
