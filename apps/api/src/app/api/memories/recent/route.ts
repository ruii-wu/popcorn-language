// src/app/api/memories/recent/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';

// Right-panel "What X knows" / "Memories from this chat": the npc's cards plus cross-NPC observations.
export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const url = new URL(req.url);
    const npcId = url.searchParams.get('npcId') ?? undefined;

    const rows = await prisma.memory.findMany({
      where: { userId, dismissedAt: null, ...(npcId ? { OR: [{ npcId }, { npcId: null }] } : {}) },
      orderBy: { noticedAt: 'desc' },
      take: 5,
    });

    return json(rows.map((m) => ({ id: m.id, title: m.title, body: m.body })));
  });
}
