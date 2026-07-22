// src/app/api/scenarios/sessions/[id]/decline/route.ts
import { DeclineBody } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, errorJson } from '@/server/http/respond';
import { declineScenario } from '@/server/scenario/lifecycle';
import { ScenarioError } from '@/server/scenario/accept';
import { sseResponse } from '@/server/sse/events';
import { streamDeferredChat } from '@/server/chat/streamChat';
import { ollamaForUser } from '@/server/llm/userClient';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const parsed = DeclineBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'invalid decline payload');
    const body = parsed.data;
    try {
      const declined = await declineScenario({ prisma, userId, sessionId: params.id, reason: body.reason });
      if (declined.deferredText) {
        return sseResponse(streamDeferredChat({
          prisma,
          ollama: await ollamaForUser(prisma, userId),
          userId,
          npcId: declined.npcId,
          threadId: declined.threadId,
          userMsgId: declined.userMsgId ?? '',
          text: declined.deferredText,
          signal: req.signal,
          progressionAlreadyApplied: true,
        }));
      }
      return sseResponse((async function* () {
        yield { event: 'done', data: {} };
      })());
    } catch (e) {
      if (e instanceof ScenarioError) return errorJson(e.code === 'NOT_FOUND' ? 404 : 409, e.code, e.message);
      throw e;
    }
  });
}
