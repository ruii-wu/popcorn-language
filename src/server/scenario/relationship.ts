// src/server/scenario/relationship.ts
import type { PrismaClient } from '@prisma/client';

const GRADE_POINTS: Record<string, number> = {
  'A+': 15, A: 12, 'A-': 10, 'B+': 9, B: 8, 'B-': 6, C: 3, '—': 0,
};

export function gradePoints(grade: string): number {
  return GRADE_POINTS[grade] ?? 0;
}

export function stageForPoints(points: number): { stage: string; stageValue: number } {
  if (points >= 70) return { stage: 'close', stageValue: 3 };
  if (points >= 30) return { stage: 'friend', stageValue: 2 };
  return { stage: 'acquaintance', stageValue: 1 };
}

// Applies a completed scenario's grade to the relationship: add points, recompute stage,
// record a RelationshipEvent on a stage-up. Returns the stage change for the SSE payload, or null.
// (W4 owns only the scenario-outcome recompute; general per-message progression is W5.)
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
