import { MeResponse } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { computeStreak } from '@/server/users/streak';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return errorJson(401, 'UNAUTHORIZED', 'Sign in required');

    const events = await prisma.activityEvent.findMany({
      where: { userId, type: 'message_sent' },
      select: { createdAt: true },
    });
    const streak = computeStreak(events.map((e) => e.createdAt));

    const [conversations, scenarios, memories] = await Promise.all([
      prisma.message.count({ where: { userId } }),
      prisma.scenarioSession.count({ where: { userId, status: 'completed' } }),
      prisma.memory.count({ where: { userId } }),
    ]);

    const out: MeResponse = {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        language: user.language,
        targetLang: user.targetLang,
      },
      streak: { days: streak.days, weekCount: streak.weekCount },
      totals: { conversations, scenarios, memories },
    };
    return json(out);
  });
}
