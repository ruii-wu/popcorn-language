import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { listFacts } from '@/server/memory/recall';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const n = await prisma.npc.findUnique({ where: { id: params.id } });
    if (!n) return errorJson(404, 'NOT_FOUND', 'No such NPC');

    const rel = await prisma.relationship.findUnique({ where: { userId_npcId: { userId, npcId: n.id } } });
    const messages = await prisma.message.count({ where: { thread: { userId, npcId: n.id } } });

    return json({
      id: n.id,
      name: n.name,
      persona: n.shortBio,
      languageProfile: JSON.parse(n.languageProfile),
      relationship: rel?.stage ?? 'acquaintance',
      knownFacts: await listFacts(prisma, userId, 8),
      chatStats: { messages, conversationCount: rel?.conversationCount ?? 0 },
    });
  });
}
