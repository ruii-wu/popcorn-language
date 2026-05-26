// src/server/relationship/progression.ts
import type { PrismaClient } from '@prisma/client';
import { stageForPoints } from './stage';

export const MESSAGE_POINT = 1;
export const DAILY_POINT_CAP = 10; // max message-points per (user, npc) per calendar day

function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface ProgressionResult {
  pointsAwarded: number;
  relationshipPoints: number;
  stageChange: { from: string; to: string } | null;
}

// Module 5 (general per-message): one user chat message → +1 relationship point (daily-capped
// per npc), conversationCount++, lastInteractionAt now; recompute stage and, on a cross-threshold
// stage-up, record a RelationshipEvent + a 'relationship_up' ActivityEvent.
// The daily count is read from today's 'message_sent' ActivityEvents for this npc — streamChat
// records that event *before* calling this, so the current message is included in the count.
export async function applyMessageProgression(
  prisma: PrismaClient,
  userId: string,
  npcId: string,
  now: Date = new Date(),
): Promise<ProgressionResult> {
  const rel = await prisma.relationship.upsert({
    where: { userId_npcId: { userId, npcId } },
    create: { userId, npcId },
    update: {},
  });

  const todays = await prisma.activityEvent.findMany({
    where: { userId, type: 'message_sent', createdAt: { gte: startOfDay(now) } },
  });
  const countForNpc = todays.filter((e) => {
    try { return (JSON.parse(e.payload) as { npcId?: string }).npcId === npcId; } catch { return false; }
  }).length;

  const pointsAwarded = countForNpc <= DAILY_POINT_CAP ? MESSAGE_POINT : 0;
  const points = rel.relationshipPoints + pointsAwarded;
  const computed = stageForPoints(points);
  // Stage is monotonic: chatting can only raise it, never lower it. Reverse decay is P1 (spec §七 M5),
  // so a relationship whose stage outranks its points (e.g. set by a scenario fixture) is left intact.
  const changed = computed.stageValue > rel.stageValue;
  const stage = changed ? computed.stage : rel.stage;
  const stageValue = changed ? computed.stageValue : rel.stageValue;

  await prisma.relationship.update({
    where: { id: rel.id },
    data: {
      relationshipPoints: points,
      stage,
      stageValue,
      conversationCount: { increment: 1 },
      lastInteractionAt: now,
    },
  });

  if (!changed) return { pointsAwarded, relationshipPoints: points, stageChange: null };

  await prisma.relationshipEvent.create({
    data: { relationshipId: rel.id, fromStage: rel.stage, toStage: computed.stage, reason: 'msg_count_threshold' },
  });
  await prisma.activityEvent.create({
    data: { userId, type: 'relationship_up', payload: JSON.stringify({ npcId, from: rel.stage, to: computed.stage }) },
  });
  return { pointsAwarded, relationshipPoints: points, stageChange: { from: rel.stage, to: computed.stage } };
}
