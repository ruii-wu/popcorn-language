// src/app/api/achievements/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const [defs, unlocked] = await Promise.all([
      // Static defs are shown to everyone (locked or unlocked)...
      prisma.achievementDef.findMany({ where: { enabled: true, isDynamic: false }, orderBy: { id: 'asc' } }),
      prisma.userAchievement.findMany({ where: { userId }, include: { achievement: true } }),
    ]);
    const at = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));

    const staticList = defs.map((d) => ({
      id: d.id, title: d.title, description: d.description, icon: d.icon,
      unlocked: at.has(d.id), unlockedAt: at.get(d.id) ?? null,
    }));

    // ...dynamic defs are private: append only the caller's own unlocked ones.
    const dynamicList = unlocked
      .filter((u) => u.achievement.isDynamic)
      .map((u) => ({
        id: u.achievement.id, title: u.achievement.title, description: u.achievement.description,
        icon: u.achievement.icon, unlocked: true, unlockedAt: u.unlockedAt,
      }));

    return json([...staticList, ...dynamicList]);
  });
}
