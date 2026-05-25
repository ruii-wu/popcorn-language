import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';
import { mapMessageToApi } from '@/server/chat/threads';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { npcId: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const url = new URL(req.url);
    const before = url.searchParams.get('before');
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 100);

    const thread = await prisma.thread.findUnique({ where: { userId_npcId: { userId, npcId: params.npcId } } });
    if (!thread) return json({ messages: [], hasMore: false });

    let beforeCreatedAt: Date | undefined;
    if (before) {
      const b = await prisma.message.findUnique({ where: { id: before } });
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
