import { MeResponse } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { computeStreak } from '@/server/users/streak';
import { visibleUserMessageWhere } from '@/server/users/visibleActivity';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return errorJson(401, 'UNAUTHORIZED', 'Sign in required');

    const [messages, scenarios, memories] = await Promise.all([
      prisma.message.findMany({
        where: visibleUserMessageWhere(userId),
        select: { createdAt: true },
      }),
      prisma.scenarioSession.count({ where: { userId, status: 'completed', hiddenAt: null } }),
      prisma.memory.count({ where: { userId } }),
    ]);
    const streak = computeStreak(messages.map((message) => message.createdAt));

    const out: MeResponse = {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        language: user.language,
        targetLang: user.targetLang,
      },
      streak: { days: streak.days, weekCount: streak.weekCount },
      totals: { conversations: messages.length, scenarios, memories },
    };
    return json(out);
  });
}
