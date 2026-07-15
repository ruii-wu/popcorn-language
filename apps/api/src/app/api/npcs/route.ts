import { NpcListItem } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const npcs = await prisma.npc.findMany({ orderBy: { id: 'asc' } });
    const rels = await prisma.relationship.findMany({ where: { userId } });
    const relByNpc = new Map(rels.map((r) => [r.npcId, r]));
    const threads = await prisma.thread.findMany({
      where: { userId },
      include: { messages: { where: { hiddenAt: null }, orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const threadByNpc = new Map(threads.map((t) => [t.npcId, t]));

    const out = npcs.map((n): NpcListItem => {
      const rel = relByNpc.get(n.id);
      const last = threadByNpc.get(n.id)?.messages[0];
      return {
        id: n.id,
        name: n.name,
        avatar: { glyph: n.avatarGlyph, bg: n.avatarBg, ink: n.avatarInk },
        status: rel ? 'active' : 'new',
        relationship: rel?.stage ?? 'acquaintance',
        stageValue: rel?.stageValue ?? 1,
        lastMessage: last ? (last.retractedAt ? 'Message retracted' : last.text) : null,
        lastTime: last?.createdAt ?? null,
        hasSomething: false, // W3: set when there are undismissed memories
      };
    });
    return json(out);
  });
}
