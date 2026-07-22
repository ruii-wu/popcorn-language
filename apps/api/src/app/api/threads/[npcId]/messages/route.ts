import { SendMessageBody, ThreadResponse } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { requireUser } from '@/server/auth/requireUser';
import { mapCompletedScenarioToApi, mapMessageToApi } from '@/server/chat/threads';
import { sseResponse } from '@/server/sse/events';
import { streamChat } from '@/server/chat/streamChat';
import { ollamaForUser } from '@/server/llm/userClient';

export async function GET(req: Request, { params }: { params: { npcId: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const url = new URL(req.url);
    const before = url.searchParams.get('before');
    const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50), 100);

    const thread = await prisma.thread.findUnique({ where: { userId_npcId: { userId, npcId: params.npcId } } });
    if (!thread) return json({ messages: [], hasMore: false });

    const [casualMessages, completedScenarios] = await Promise.all([
      prisma.message.findMany({
        where: { threadId: thread.id, scenarioSessionId: null, hiddenAt: null },
      }),
      prisma.scenarioSession.findMany({
        where: { threadId: thread.id, status: 'completed', hiddenAt: null },
        include: { template: { select: { title: true } }, summary: { select: { grade: true } } },
      }),
    ]);

    // The casual timeline treats each completed Scenario as one event. Its transcript remains
    // available through the session-detail endpoint instead of expanding into ordinary chat.
    const timeline: ThreadResponse['messages'] = [
      ...casualMessages.map(mapMessageToApi),
      ...completedScenarios.map(mapCompletedScenarioToApi),
    ].sort((a, b) => {
      const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      const byTime = timeA - timeB;
      return byTime || a.id.localeCompare(b.id);
    });

    // A cursor is valid only when it belongs to this merged timeline. Foreign or stale ids are
    // ignored, matching the previous thread-scoped cursor behavior.
    const cursorIndex = before ? timeline.findIndex((item) => item.id === before) : -1;
    const available = cursorIndex >= 0 ? timeline.slice(0, cursorIndex) : timeline;
    const hasMore = available.length > limit;
    const page = available.slice(-limit);
    const out: ThreadResponse = { messages: page, hasMore };
    return json(out);
  });
}

export async function POST(req: Request, { params }: { params: { npcId: string } }): Promise<Response> {
  let userId: string;
  try {
    userId = requireUser(req).userId;
  } catch {
    return errorJson(401, 'UNAUTHORIZED', 'Sign in required');
  }
  const parsed = SendMessageBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson(400, 'BAD_REQUEST', 'text is required');

  const gen = streamChat({
    prisma,
    ollama: await ollamaForUser(prisma, userId),
    userId,
    npcId: params.npcId,
    text: parsed.data.text,
    lang: parsed.data.lang,
  });
  return sseResponse(gen);
}
