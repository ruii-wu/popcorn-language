// src/app/api/achievements/generate/route.ts
import { prisma } from '@/server/db/client';
import { OllamaClient } from '@/server/llm/ollama';
import { withUser, json } from '@/server/http/respond';
import { generateDynamicAchievement } from '@/server/achievements/dynamic';

export async function POST(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const achievement = await generateDynamicAchievement(prisma, new OllamaClient(), userId);
    return json({ achievement });
  });
}
