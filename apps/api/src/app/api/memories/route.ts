// src/app/api/memories/route.ts
import { MemoryItem } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const url = new URL(req.url);
    const npcId = url.searchParams.get('npcId') ?? undefined;
    const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit')) || 50), 100);

    const rows = await prisma.memory.findMany({
      where: { userId, dismissedAt: null, ...(npcId ? { npcId } : {}) },
      orderBy: { noticedAt: 'desc' },
      take: limit,
    });

    return json(
      rows.map((m): MemoryItem => ({
        id: m.id,
        title: m.title,
        body: m.body,
        noticedAt: m.noticedAt,
        sourceType: m.sourceType,
        sourceRef: m.sourceRef,
        npcId: m.npcId,
      })),
    );
  });
}
