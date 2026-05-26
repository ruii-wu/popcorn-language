import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyMessageProgression, DAILY_POINT_CAP } from '@/server/relationship/progression';

const prisma = new PrismaClient();
const U = '__w5_progression_user__';

async function reset() {
  await prisma.user.deleteMany({ where: { username: U } });
}
beforeEach(reset);
afterAll(async () => { await reset(); await prisma.$disconnect(); });

// streamChat records the 'message_sent' ActivityEvent *before* calling progression, so the
// helper sees the current message in today's count. We mirror that here.
async function sendOnce(userId: string, npcId: string, now?: Date) {
  await prisma.activityEvent.create({ data: { userId, type: 'message_sent', payload: JSON.stringify({ npcId }) } });
  return applyMessageProgression(prisma, userId, npcId, now);
}

describe('applyMessageProgression', () => {
  it('awards +1, bumps conversationCount, and stamps lastInteractionAt', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const r = await sendOnce(user.id, 'lily');
    expect(r.pointsAwarded).toBe(1);
    expect(r.stageChange).toBeNull();
    const rel = await prisma.relationship.findUniqueOrThrow({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel.relationshipPoints).toBe(1);
    expect(rel.conversationCount).toBe(1);
    expect(rel.lastInteractionAt).not.toBeNull();
  });

  it('records a RelationshipEvent + relationship_up event when crossing a stage threshold', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'acquaintance', stageValue: 1, relationshipPoints: 29 } });
    const r = await sendOnce(user.id, 'lily');
    expect(r.stageChange).toEqual({ from: 'acquaintance', to: 'friend' });
    const rel = await prisma.relationship.findUniqueOrThrow({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel.stage).toBe('friend');
    expect(rel.relationshipPoints).toBe(30);
    const evt = await prisma.relationshipEvent.findFirst({ where: { relationshipId: rel.id } });
    expect(evt?.toStage).toBe('friend');
    expect(evt?.reason).toBe('msg_count_threshold');
    expect(await prisma.activityEvent.count({ where: { userId: user.id, type: 'relationship_up' } })).toBe(1);
  });

  it('caps daily points: the (CAP+1)-th message of the day awards 0', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    let last = { pointsAwarded: -1 } as { pointsAwarded: number };
    for (let i = 0; i < DAILY_POINT_CAP + 1; i++) last = await sendOnce(user.id, 'lily');
    expect(last.pointsAwarded).toBe(0);
    const rel = await prisma.relationship.findUniqueOrThrow({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel.relationshipPoints).toBe(DAILY_POINT_CAP);
    expect(rel.conversationCount).toBe(DAILY_POINT_CAP + 1);
  });

  it('scopes the daily count per npc — a different npc still earns its own point', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    for (let i = 0; i < DAILY_POINT_CAP + 1; i++) await sendOnce(user.id, 'lily');
    const r = await sendOnce(user.id, 'chen');
    expect(r.pointsAwarded).toBe(1);
  });
});
