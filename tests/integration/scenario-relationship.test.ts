// tests/integration/scenario-relationship.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { applyScenarioOutcome, gradePoints, stageForPoints } from '@/server/scenario/relationship';

const prisma = new PrismaClient();
const U = '__w4_rel_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('scenario relationship outcome', () => {
  it('maps grades to points and points to stages', () => {
    expect(gradePoints('A+')).toBe(15);
    expect(gradePoints('B')).toBe(8);
    expect(gradePoints('—')).toBe(0);
    expect(stageForPoints(10)).toEqual({ stage: 'acquaintance', stageValue: 1 });
    expect(stageForPoints(35)).toEqual({ stage: 'friend', stageValue: 2 });
    expect(stageForPoints(80)).toEqual({ stage: 'close', stageValue: 3 });
  });

  it('adds points, bumps scenarioCount, and records a RelationshipEvent on stage-up', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const rel = await prisma.relationship.create({
      data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2, relationshipPoints: 65 },
    });

    const change = await applyScenarioOutcome(prisma, user.id, 'lily', 'A', 'Mock Interview');
    expect(change).toEqual({ from: 'friend', to: 'close' });

    const reloaded = await prisma.relationship.findUniqueOrThrow({ where: { id: rel.id } });
    expect(reloaded.relationshipPoints).toBe(77);
    expect(reloaded.stage).toBe('close');
    expect(reloaded.scenarioCount).toBe(1);

    const evt = await prisma.relationshipEvent.findFirst({ where: { relationshipId: rel.id } });
    expect(evt?.fromStage).toBe('friend');
    expect(evt?.toStage).toBe('close');
    expect(evt?.reason).toContain('Mock Interview');
  });

  it('returns null (no event) when the stage does not change', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const change = await applyScenarioOutcome(prisma, user.id, 'lily', 'C', 'Mock Interview');
    expect(change).toBeNull();
  });
});
