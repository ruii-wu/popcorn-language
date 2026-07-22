import { SendMessageBody, ThreadResponse } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { requireUser } from '@/server/auth/requireUser';
import { mapCompletedScenarioToApi, mapMessageToApi } from '@/server/chat/threads';
import { sseResponse } from '@/server/sse/events';
import { streamChat } from '@/server/chat/streamChat';
import { ollamaForUser } from '@/server/llm/userClient';
import type { Prisma } from '@prisma/client';

interface TimelineCursor {
  kind: 'message' | 'scenario';
  id: string;
  time: Date;
}

function scenarioCursorWhere(
  field: 'endedAt' | 'invitedAt',
  cursor: TimelineCursor,
): Prisma.ScenarioSessionWhereInput {
  const earlier = { [field]: { lt: cursor.time } } as Prisma.ScenarioSessionWhereInput;
  if (cursor.kind === 'message') return earlier;
  const sameTimeEarlierId = { [field]: cursor.time, id: { lt: cursor.id } } as Prisma.ScenarioSessionWhereInput;
  return { OR: [earlier, sameTimeEarlierId] };
}

export async function GET(req: Request, { params }: { params: { npcId: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const url = new URL(req.url);
    const before = url.searchParams.get('before');
    const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50), 100);

    const thread = await prisma.thread.findUnique({ where: { userId_npcId: { userId, npcId: params.npcId } } });
    if (!thread) return json({ messages: [], hasMore: false });

    let cursor: TimelineCursor | null = null;
    if (before?.startsWith('scenario:')) {
      const id = before.slice('scenario:'.length);
      const row = await prisma.scenarioSession.findFirst({
        where: { id, threadId: thread.id, status: 'completed', hiddenAt: null },
        select: { id: true, invitedAt: true, endedAt: true },
      });
      if (row) cursor = { kind: 'scenario', id: row.id, time: row.endedAt ?? row.invitedAt };
    } else if (before) {
      const row = await prisma.message.findFirst({
        where: { id: before, threadId: thread.id, scenarioSessionId: null, hiddenAt: null },
        select: { id: true, createdAt: true },
      });
      if (row) cursor = { kind: 'message', id: row.id, time: row.createdAt };
    }

    const messageCursorWhere: Prisma.MessageWhereInput | undefined = cursor
      ? cursor.kind === 'message'
        ? { OR: [{ createdAt: { lt: cursor.time } }, { createdAt: cursor.time, id: { lt: cursor.id } }] }
        : { createdAt: { lte: cursor.time } }
      : undefined;
    const scenarioInclude = {
      template: { select: { title: true } },
      summary: { select: { grade: true } },
    } satisfies Prisma.ScenarioSessionInclude;

    // Each source contributes at most limit + 1 candidates. Completed legacy rows with no
    // endedAt use invitedAt as their event time, so query them separately to preserve ordering.
    const [casualMessages, endedScenarios, legacyScenarios] = await Promise.all([
      prisma.message.findMany({
        where: {
          threadId: thread.id,
          scenarioSessionId: null,
          hiddenAt: null,
          ...(messageCursorWhere ? { AND: [messageCursorWhere] } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      prisma.scenarioSession.findMany({
        where: {
          threadId: thread.id,
          status: 'completed',
          hiddenAt: null,
          AND: [
            { endedAt: { not: null } },
            ...(cursor ? [scenarioCursorWhere('endedAt', cursor)] : []),
          ],
        },
        include: scenarioInclude,
        orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      prisma.scenarioSession.findMany({
        where: {
          threadId: thread.id,
          status: 'completed',
          hiddenAt: null,
          endedAt: null,
          ...(cursor ? { AND: [scenarioCursorWhere('invitedAt', cursor)] } : {}),
        },
        include: scenarioInclude,
        orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
    ]);

    // The casual timeline treats each completed Scenario as one event. Its transcript remains
    // available through the session-detail endpoint instead of expanding into ordinary chat.
    const timeline: ThreadResponse['messages'] = [
      ...casualMessages.map(mapMessageToApi),
      ...endedScenarios.map(mapCompletedScenarioToApi),
      ...legacyScenarios.map(mapCompletedScenarioToApi),
    ].sort((a, b) => {
      const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      const byTime = timeA - timeB;
      if (byTime) return byTime;
      // At the same timestamp, casual messages precede Scenario cards. The cursor predicates
      // above intentionally mirror this ordering so pagination remains stable across page edges.
      const byKind = Number(a.kind === 'scenario') - Number(b.kind === 'scenario');
      return byKind || a.id.localeCompare(b.id);
    });

    // Foreign or stale cursors resolve to null above and intentionally behave like the latest page.
    const hasMore = timeline.length > limit;
    const page = timeline.slice(-limit);
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
    signal: req.signal,
  });
  return sseResponse(gen);
}
