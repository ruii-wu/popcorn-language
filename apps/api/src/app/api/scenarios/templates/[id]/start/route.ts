import type { StartScenarioResponse } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { startScenarioFromTemplate, RecommendationError } from '@/server/learning/recommend';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    try {
      const result = await startScenarioFromTemplate({ prisma, userId, templateId: params.id });
      const out: StartScenarioResponse = { ok: true, ...result };
      return json(out);
    } catch (e) {
      if (e instanceof RecommendationError) return errorJson(e.code === 'NOT_FOUND' ? 404 : 409, e.code, e.message);
      throw e;
    }
  });
}
