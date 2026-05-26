// src/server/scenario/relationship.ts
import type { PrismaClient } from '@prisma/client';
import { stageForPoints } from '@/server/relationship/stage';

export { stageForPoints };

const GRADE_POINTS: Record<string, number> = {
  'A+': 15, A: 12, 'A-': 10, 'B+': 9, B: 8, 'B-': 6, C: 3, '—': 0,
};

export function gradePoints(grade: string): number {
  return GRADE_POINTS[grade] ?? 0;
}

// Applies a completed scenario's grade to the relationship: add points, recompute stage,
// record a RelationshipEvent on a stage-up. Returns the stage change for the SSE payload, or null.
export async function applyScenarioOutcome(
  prisma: PrismaClient,
  userId: string,
  npcId: string,
  grade: string,
  scenarioTitle: string,
): Promise<{ from: string; to: string } | null> {
  const rel = await prisma.relationship.upsert({
    where: { userId_npcId: { userId, npcId } },
    create: { userId, npcId },
    update: {},
  });

  const points = rel.relationshipPoints + gradePoints(grade);
  const next = stageForPoints(points);
  const changed = next.stageValue > rel.stageValue;

  await prisma.relationship.update({
    where: { id: rel.id },
    data: {
      relationshipPoints: points,
      stage: next.stage,
      stageValue: next.stageValue,
      scenarioCount: { increment: 1 },
      lastInteractionAt: new Date(),
    },
  });

  if (!changed) return null;

  await prisma.relationshipEvent.create({
    data: { relationshipId: rel.id, fromStage: rel.stage, toStage: next.stage, reason: `scenario_completed:${scenarioTitle}` },
  });
  return { from: rel.stage, to: next.stage };
}
