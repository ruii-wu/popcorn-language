// src/app/api/scenarios/sessions/[id]/choose/route.ts
import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { errorJson } from '@/server/http/respond';
import { requireUser } from '@/server/auth/requireUser';
import { sseResponse } from '@/server/sse/events';
import { OllamaClient } from '@/server/llm/ollama';
import { runScenarioTurn } from '@/server/scenario/turn';

export const dynamic = 'force-dynamic';

const Body = z.object({ choiceId: z.string().min(1), tone: z.string().optional(), text: z.string().optional() });

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  let userId: string;
  try { userId = requireUser(req).userId; } catch { return errorJson(401, 'UNAUTHORIZED', 'Sign in required'); }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'choiceId is required');

  return sseResponse(
    runScenarioTurn({
      prisma, ollama: new OllamaClient(), userId, sessionId: params.id,
      choiceId: parsed.data.choiceId, tone: parsed.data.tone, text: parsed.data.text,
    }),
  );
}
