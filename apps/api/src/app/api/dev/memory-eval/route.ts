// src/app/api/dev/memory-eval/route.ts
import { MemoryEvalBody } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { OllamaClient } from '@/server/llm/ollama';
import { withUser, json, errorJson } from '@/server/http/respond';
import { runMemoryEval } from '@/server/memory/eval/harness';

export async function POST(req: Request): Promise<Response> {
  // Dev-only research surface — the endpoint does not exist in production.
  if (process.env.NODE_ENV === 'production') {
    return errorJson(404, 'NOT_FOUND', 'not found');
  }
  return withUser(req, async (userId) => {
    const parsed = MemoryEvalBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'invalid memory-eval payload');
    const result = await runMemoryEval(prisma, new OllamaClient(), userId, parsed.data);
    return json(result);
  });
}
