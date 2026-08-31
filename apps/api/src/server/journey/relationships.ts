// src/server/journey/relationships.ts
import type { PrismaClient } from '@prisma/client';

export interface RelationshipCard {
  npcId: string;
  name: string;
  stage: string;
  stageValue: number;
  note: string | null;
  last: string | null;
}

const SUB_LABEL: Record<string, string> = {
  acquaintance: 'Acquaintance',
  friend: 'Friend',
  close: 'Close friend',
};

// One card per seeded NPC (mirrors GET /api/npcs), merged with the caller's relationship.
// `note` is the most recent stage-change event; `last` is lastInteractionAt.
export async function buildRelationshipCards(prisma: PrismaClient, userId: string): Promise<RelationshipCard[]> {
  const npcs = await prisma.npc.findMany({ orderBy: { id: 'asc' } });
  const rels = await prisma.relationship.findMany({
    where: { userId },
    include: { events: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] } },
  });
  const byNpc = new Map(rels.map((r) => [r.npcId, r]));
  const orderedNpcs = [...npcs].sort((a, b) => Number(b.id === 'lily') - Number(a.id === 'lily'));

  return orderedNpcs.map((n) => {
    const rel = byNpc.get(n.id);
    const stage = rel?.stage ?? 'acquaintance';
    const ev = rel?.events.find((event) => event.toStage === stage) ?? rel?.events[0];
    return {
      npcId: n.id,
      name: n.name,
      stage,
      stageValue: rel?.stageValue ?? 1,
      note: ev ? `${SUB_LABEL[ev.fromStage] ?? ev.fromStage} → ${SUB_LABEL[ev.toStage] ?? ev.toStage}` : null,
      last: rel?.lastInteractionAt?.toISOString() ?? null,
    };
  });
}
