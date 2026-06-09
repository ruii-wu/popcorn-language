import { z } from 'zod';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { requireUser } from '@/server/auth/requireUser';
import { mapMessageToApi } from '@/server/chat/threads';
import { sseResponse } from '@/server/sse/events';
import { streamChat } from '@/server/chat/streamChat';
import { OllamaClient } from '@/server/llm/ollama';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { npcId: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const url = new URL(req.url);
    const before = url.searchParams.get('before');
    const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50), 100);

    const thread = await prisma.thread.findUnique({ where: { userId_npcId: { userId, npcId: params.npcId } } });
    if (!thread) return json({ messages: [], hasMore: false });

    let beforeCreatedAt: Date | undefined;
    if (before) {
      // scope the cursor to this thread: a foreign id must not steer pagination
      const b = await prisma.message.findFirst({ where: { id: before, threadId: thread.id } });
      beforeCreatedAt = b?.createdAt;
    }

    const rows = await prisma.message.findMany({
      where: { threadId: thread.id, ...(beforeCreatedAt ? { createdAt: { lt: beforeCreatedAt } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();
    return json({ messages: page.map(mapMessageToApi), hasMore });
  });
}

const PostBody = z.object({ text: z.string().min(1), lang: z.string().optional() });

export async function POST(req: Request, { params }: { params: { npcId: string } }): Promise<Response> {
  let userId: string;
  try {
    userId = requireUser(req).userId;
  } catch {
    return errorJson(401, 'UNAUTHORIZED', 'Sign in required');
  }
  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'text is required');

  const gen = streamChat({
    prisma,
    ollama: new OllamaClient(),
    userId,
    npcId: params.npcId,
    text: parsed.data.text,
    lang: parsed.data.lang,
  });
  return sseResponse(gen);
}
