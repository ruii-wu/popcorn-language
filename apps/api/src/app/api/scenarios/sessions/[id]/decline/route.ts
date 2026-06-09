// src/app/api/scenarios/sessions/[id]/decline/route.ts
import { DeclineBody, OkResponse } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { declineScenario } from '@/server/scenario/lifecycle';
import { ScenarioError } from '@/server/scenario/accept';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const parsed = DeclineBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'invalid decline payload');
    const body = parsed.data;
    try {
      await declineScenario({ prisma, userId, sessionId: params.id, reason: body.reason });
      const out: OkResponse = { ok: true };
      return json(out);
    } catch (e) {
      if (e instanceof ScenarioError) return errorJson(e.code === 'NOT_FOUND' ? 404 : 409, e.code, e.message);
      throw e;
    }
  });
}
