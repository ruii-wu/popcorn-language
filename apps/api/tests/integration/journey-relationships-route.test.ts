// tests/integration/journey-relationships-route.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/journey/relationships/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w6_journey_rel__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const get = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('GET /api/journey/relationships', () => {
  it('401s without a cookie', async () => {
    expect((await GET(new Request('http://x/'))).status).toBe(401);
  });

  it('returns a card per seeded NPC, with stage + latest-event note for ones the user has', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const rel = await prisma.relationship.create({
      data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2, relationshipPoints: 40, lastInteractionAt: new Date() },
    });
    await prisma.relationshipEvent.create({
      data: { relationshipId: rel.id, fromStage: 'acquaintance', toStage: 'friend', reason: 'msg_count_threshold' },
    });

    const res = await GET(get(user.id));
    expect(res.status).toBe(200);
    const cards = await res.json();
    expect(cards.length).toBeGreaterThanOrEqual(3);

    const lily = cards.find((c: { npcId: string }) => c.npcId === 'lily');
    expect(lily.stage).toBe('friend');
    expect(lily.stageValue).toBe(2);
    expect(lily.note).toBe('Acquaintance → Friend');
    expect(lily.last).not.toBeNull();
    expect(cards[0].npcId).toBe('lily');

    const chen = cards.find((c: { npcId: string }) => c.npcId === 'chen');
    expect(chen.stage).toBe('acquaintance');
    expect(chen.stageValue).toBe(1);
    expect(chen.note).toBeNull();
    expect(chen.last).toBeNull();
  });

  it('describes the transition that produced the current stage', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const rel = await prisma.relationship.create({
      data: { userId: user.id, npcId: 'lily', stage: 'close', stageValue: 3 },
    });
    await prisma.relationshipEvent.createMany({
      data: [
        { relationshipId: rel.id, fromStage: 'acquaintance', toStage: 'friend', reason: 'messages' },
        { relationshipId: rel.id, fromStage: 'friend', toStage: 'close', reason: 'scenario' },
      ],
    });

    const cards = await (await GET(get(user.id))).json();
    expect(cards.find((card: { npcId: string }) => card.npcId === 'lily').note).toBe('Friend → Close friend');
  });
});
