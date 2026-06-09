// src/app/api/scenarios/sessions/[id]/resume/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { resumeScenario } from '@/server/scenario/lifecycle';
import { ScenarioError } from '@/server/scenario/accept';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    try {
      await resumeScenario({ prisma, userId, sessionId: params.id });
      const session = await prisma.scenarioSession.findFirst({ where: { id: params.id, userId } });
      return json({ session });
    } catch (e) {
      if (e instanceof ScenarioError) return errorJson(e.code === 'NOT_FOUND' ? 404 : 409, e.code, e.message);
      throw e;
    }
  });
}
