import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const [defs, unlocked] = await Promise.all([
      prisma.achievementDef.findMany({ where: { enabled: true }, orderBy: { id: 'asc' } }),
      prisma.userAchievement.findMany({ where: { userId } }),
    ]);
    const at = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));
    return json(
      defs.map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        icon: d.icon,
        unlocked: at.has(d.id),
        unlockedAt: at.get(d.id) ?? null,
      })),
    );
  });
}
