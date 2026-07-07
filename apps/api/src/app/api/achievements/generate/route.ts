// src/app/api/achievements/generate/route.ts
import { prisma } from '@/server/db/client';
import { ollamaForUser } from '@/server/llm/userClient';
import { withUser, json } from '@/server/http/respond';
import { generateDynamicAchievement } from '@/server/achievements/dynamic';

export async function POST(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const achievement = await generateDynamicAchievement(prisma, await ollamaForUser(prisma, userId), userId);
    return json({ achievement });
  });
}
