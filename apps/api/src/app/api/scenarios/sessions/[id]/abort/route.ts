// src/app/api/scenarios/sessions/[id]/abort/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { abortScenario } from '@/server/scenario/lifecycle';
import { ScenarioError } from '@/server/scenario/accept';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    try {
      await abortScenario({ prisma, userId, sessionId: params.id });
      return json({ ok: true });
    } catch (e) {
      if (e instanceof ScenarioError) return errorJson(e.code === 'NOT_FOUND' ? 404 : 409, e.code, e.message);
      throw e;
    }
  });
}
