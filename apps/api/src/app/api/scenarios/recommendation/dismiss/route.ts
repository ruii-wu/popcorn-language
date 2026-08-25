import { DismissRecommendationBody } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { dismissRecommendation, RecommendationError } from '@/server/learning/recommend';

export async function POST(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const parsed = DismissRecommendationBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'invalid dismiss payload');
    try {
      await dismissRecommendation({ prisma, userId, templateId: parsed.data.templateId });
      return json({ ok: true });
    } catch (e) {
      if (e instanceof RecommendationError) return errorJson(e.code === 'NOT_FOUND' ? 404 : 409, e.code, e.message);
      throw e;
    }
  });
}
