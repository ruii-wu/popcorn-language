import { ProfileBody, ProfileResponse } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { isCefrLevel } from '@/server/learning/taxonomy';

function normalizeCefr(value: unknown): ProfileResponse['cefrLevel'] {
  return isCefrLevel(value) ? value : null;
}

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    const p = user?.profile;
    const out: ProfileResponse = {
      role: p?.role ?? null,
      goal: p?.goal ?? null,
      interests: p ? (JSON.parse(p.interests) as string[]) : [],
      language: user?.language ?? 'zh-CN',
      cefrLevel: normalizeCefr(user?.cefrLevel),
    };
    return json(out);
  });
}

export async function PUT(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const parsed = ProfileBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'invalid profile payload');
    const { role, goal, interests, language, cefrLevel } = parsed.data;
    const interestsJson = JSON.stringify(interests);
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: { userId, role: role ?? null, goal: goal ?? null, interests: interestsJson },
      update: { role: role ?? null, goal: goal ?? null, interests: interestsJson },
    });
    // language and cefrLevel live on User; only touch when the payload includes them
    if (language || cefrLevel !== undefined) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          ...(language ? { language } : {}),
          ...(cefrLevel !== undefined ? { cefrLevel: cefrLevel ?? null } : {}),
        },
      });
    }
    return json({
      ok: true,
      profile: { role: profile.role, goal: profile.goal, interests: JSON.parse(profile.interests) as string[] },
    });
  });
}
