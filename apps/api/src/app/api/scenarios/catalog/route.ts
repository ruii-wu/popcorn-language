// src/app/api/scenarios/catalog/route.ts
import { ScenarioCatalogItem } from '@popcorn/shared';
import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';
import { STAGE_VALUE } from '@/server/scenario/trigger';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async (userId) => {
    const templates = await prisma.scenarioTemplate.findMany({ where: { enabled: true } });
    const rels = await prisma.relationship.findMany({ where: { userId } });
    const stageByNpc = new Map(rels.map((r) => [r.npcId, r.stageValue]));

    return json(
      templates.map((t): ScenarioCatalogItem => ({
        id: t.id,
        title: t.title,
        titleZh: t.titleZh,
        npcId: t.npcId,
        minStage: t.minStage,
        estimatedMinutes: t.estimatedMinutes,
        registerTags: JSON.parse(t.registerTags),
        eligible: (stageByNpc.get(t.npcId) ?? 1) >= (STAGE_VALUE[t.minStage] ?? 99),
      })),
    );
  });
}
