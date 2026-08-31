import { NpcDetail } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { listFacts } from '@/server/memory/recall';
import { visibleUserMessageWhere } from '@/server/users/visibleActivity';

export async function GET(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const n = await prisma.npc.findUnique({ where: { id: params.id } });
    if (!n) return errorJson(404, 'NOT_FOUND', 'No such NPC');

    const [rel, visibleMessages, practiceTurns] = await Promise.all([
      prisma.relationship.findUnique({ where: { userId_npcId: { userId, npcId: n.id } } }),
      prisma.message.count({
        where: { thread: { userId, npcId: n.id }, hiddenAt: null, retractedAt: null },
      }),
      prisma.message.count({
        where: { ...visibleUserMessageWhere(userId), thread: { npcId: n.id } },
      }),
    ]);

    const out: NpcDetail = {
      id: n.id,
      name: n.name,
      persona: n.shortBio,
      avatar: { glyph: n.avatarGlyph, bg: n.avatarBg, ink: n.avatarInk },
      languageProfile: JSON.parse(n.languageProfile),
      topicInterests: JSON.parse(n.topicInterests),
      relationship: rel?.stage ?? 'acquaintance',
      relationshipSince: rel?.createdAt ?? null,
      knownFacts: await listFacts(prisma, userId, 8, n.id),
      chatStats: { visibleMessages, practiceTurns },
    };
    return json(out);
  });
}
