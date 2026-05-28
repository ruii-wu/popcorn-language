// src/app/api/dev/memory-eval/route.ts
import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { OllamaClient } from '@/server/llm/ollama';
import { withUser, json, errorJson } from '@/server/http/respond';
import { runMemoryEval } from '@/server/memory/eval/harness';

export const dynamic = 'force-dynamic';

const Body = z.object({
  datasetId: z.string().optional(),
  k: z.number().int().positive().max(20).optional(),
});

export async function POST(req: Request): Promise<Response> {
  // Dev-only research surface — the endpoint does not exist in production.
  if (process.env.NODE_ENV === 'production') {
    return errorJson(404, 'NOT_FOUND', 'not found');
  }
  return withUser(req, async (userId) => {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'invalid memory-eval payload');
    const result = await runMemoryEval(prisma, new OllamaClient(), userId, parsed.data);
    return json(result);
  });
}
