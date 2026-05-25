import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

const LILY = 'lily';

export async function POST(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const lily = await prisma.npc.findUnique({ where: { id: LILY } });
    if (!lily) return errorJson(500, 'SEED_MISSING', 'Lily NPC is not seeded');

    await prisma.relationship.upsert({
      where: { userId_npcId: { userId, npcId: LILY } },
      create: { userId, npcId: LILY },
      update: {},
    });
    const thread = await prisma.thread.upsert({
      where: { userId_npcId: { userId, npcId: LILY } },
      create: { userId, npcId: LILY },
      update: {},
    });

    const existing = await prisma.message.findFirst({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return json({ npc: LILY, firstMessageId: existing.id });

    const intro = await prisma.message.create({
      data: { threadId: thread.id, userId: null, role: 'npc', text: lily.introMessage },
    });
    await prisma.thread.update({ where: { id: thread.id }, data: { lastMsgAt: intro.createdAt } });
    return json({ npc: LILY, firstMessageId: intro.id });
  });
}
