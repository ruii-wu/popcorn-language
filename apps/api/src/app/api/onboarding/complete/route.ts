import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';

const LILY = 'lily';
const EMMA = 'emma';
const INITIAL_NPC_IDS = [LILY, EMMA] as const;
const INITIAL_FRIEND_RELATIONSHIP = {
  stage: 'friend',
  stageValue: 2,
  relationshipPoints: 30,
} as const;

export async function POST(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const initialNpcs = await prisma.npc.findMany({
      where: { id: { in: [...INITIAL_NPC_IDS] } },
      select: { id: true, introMessage: true },
    });
    const lily = initialNpcs.find((npc) => npc.id === LILY);
    if (initialNpcs.length !== INITIAL_NPC_IDS.length || !lily) {
      return errorJson(500, 'SEED_MISSING', 'Lily and Emma NPCs must be seeded');
    }

    await prisma.$transaction(
      INITIAL_NPC_IDS.map((npcId) => prisma.relationship.upsert({
        where: { userId_npcId: { userId, npcId } },
        create: { userId, npcId, ...INITIAL_FRIEND_RELATIONSHIP },
        update: {},
      })),
    );
    await prisma.userSettings.upsert({
      where: { userId },
      create: { userId },
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
