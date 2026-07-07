// src/app/api/scenarios/sessions/[id]/accept/route.ts
import { AcceptSessionResponse } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { ollamaForUser } from '@/server/llm/userClient';
import { acceptScenario, ScenarioError } from '@/server/scenario/accept';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    try {
      const result = await acceptScenario({ prisma, ollama: await ollamaForUser(prisma, userId), userId, sessionId: params.id });
      const out: AcceptSessionResponse = result;
      return json(out);
    } catch (e) {
      if (e instanceof ScenarioError) {
        return errorJson(e.code === 'NOT_FOUND' ? 404 : 409, e.code, e.message);
      }
      throw e;
    }
  });
}
