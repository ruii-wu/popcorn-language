// src/app/api/scenarios/sessions/[id]/freetype/route.ts
import { FreetypeBody } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { errorJson } from '@/server/http/respond';
import { requireUser } from '@/server/auth/requireUser';
import { sseResponse } from '@/server/sse/events';
import { ollamaForUser } from '@/server/llm/userClient';
import { runScenarioTurn } from '@/server/scenario/turn';

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  let userId: string;
  try { userId = requireUser(req).userId; } catch { return errorJson(401, 'UNAUTHORIZED', 'Sign in required'); }
  const parsed = FreetypeBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'text is required');

  return sseResponse(runScenarioTurn({ prisma, ollama: await ollamaForUser(prisma, userId), userId, sessionId: params.id, text: parsed.data.text }));
}
