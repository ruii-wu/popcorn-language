import type { RecommendationResponse } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';
import { recommendScenarios } from '@/server/learning/recommend';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const recs = await recommendScenarios({ prisma, userId, limit: 1 });
    const out: RecommendationResponse = { recommendation: recs[0] ?? null };
    return json(out);
  });
}
