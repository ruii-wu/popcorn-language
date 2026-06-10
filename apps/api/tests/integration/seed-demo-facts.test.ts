import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { seedDemo } from '../../prisma/seedDemo';

const prisma = new PrismaClient();
const U = '__seeddemo_facts__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('seedDemo per-NPC facts', () => {
  it('gives different NPCs different known facts and a backdated relationship', async () => {
    const { userId } = await seedDemo(prisma, { username: U });
    const facts = await prisma.memoryFact.findMany({ where: { userId } });
    const knownTo = (npc: string) =>
      facts.filter((f) => (JSON.parse(f.knownToNpcs) as string[]).includes(npc)).map((f) => f.predicate);

    expect(knownTo('lily').length).toBeGreaterThan(0);
    expect(knownTo('chen').length).toBeGreaterThan(0);
    // Lily and Chen do not know the exact same set
    expect(knownTo('lily').sort()).not.toEqual(knownTo('chen').sort());

    const lilyRel = await prisma.relationship.findFirstOrThrow({ where: { userId, npcId: 'lily' } });
    expect(lilyRel.createdAt.getTime()).toBeLessThan(Date.now() - 7 * 86_400_000); // backdated > 1 week
  });
});
