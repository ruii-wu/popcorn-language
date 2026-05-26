// src/app/api/scenarios/sessions/[id]/decline/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { declineScenario } from '@/server/scenario/lifecycle';
import { ScenarioError } from '@/server/scenario/accept';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    try {
      await declineScenario({ prisma, userId, sessionId: params.id, reason: body.reason });
      return json({ ok: true });
    } catch (e) {
      if (e instanceof ScenarioError) return errorJson(e.code === 'NOT_FOUND' ? 404 : 409, e.code, e.message);
      throw e;
    }
  });
}
