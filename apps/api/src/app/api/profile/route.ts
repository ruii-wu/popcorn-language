import { ProfileBody } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    const p = user?.profile;
    return json({
      role: p?.role ?? null,
      goal: p?.goal ?? null,
      interests: p ? (JSON.parse(p.interests) as string[]) : [],
      language: user?.language ?? 'zh-CN',
    });
  });
}

export async function PUT(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const parsed = ProfileBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'invalid profile payload');
    const { role, goal, interests, language } = parsed.data;
    const interestsJson = JSON.stringify(interests);
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: { userId, role: role ?? null, goal: goal ?? null, interests: interestsJson },
      update: { role: role ?? null, goal: goal ?? null, interests: interestsJson },
    });
    if (language) await prisma.user.update({ where: { id: userId }, data: { language } });
    return json({
      ok: true,
      profile: { role: profile.role, goal: profile.goal, interests: JSON.parse(profile.interests) as string[] },
    });
  });
}
