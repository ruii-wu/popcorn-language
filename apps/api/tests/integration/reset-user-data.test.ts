// tests/integration/reset-user-data.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { resetUserData } from '@/server/users/reset';

const prisma = new PrismaClient();
const UA = '__w6_reset_a__';
const UB = '__w6_reset_b__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { in: [UA, UB] } } });
  await prisma.$disconnect();
});

async function seedUser(username: string) {
  const user = await prisma.user.create({ data: { username, password: 'pw' } });
  await prisma.userProfile.create({ data: { userId: user.id, role: 'Student', interests: '[]' } });
  await prisma.userSettings.create({ data: { userId: user.id } });
  const rel = await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily' } });
  await prisma.relationshipEvent.create({ data: { relationshipId: rel.id, fromStage: 'acquaintance', toStage: 'friend', reason: 'x' } });
  const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
  await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'hi' } });
  await prisma.memory.create({ data: { userId: user.id, title: 't', body: 'b', sourceType: 'chat_pattern' } });
  await prisma.memoryFact.create({ data: { userId: user.id, predicate: 'has_pet', value: 'cat' } });
  await prisma.userAchievement.create({ data: { userId: user.id, achievementId: 'first_chat' } });
  await prisma.activityEvent.create({ data: { userId: user.id, type: 'message_sent' } });
  // A standalone learning signal (no source Message/Session) — simulates a future
  // conversation_review record that would otherwise leak past reset.
  await prisma.learningSignal.create({
    data: {
      userId: user.id,
      sourceType: 'conversation_review',
      sourceRef: 'review-' + user.id,
      skillCode: 'grammar.past_tense',
      polarity: 'mistake',
      score: 0.3,
      confidence: 0.8,
      weight: 1,
    },
  });
  return user;
}

describe('resetUserData', () => {
  it('wipes the user\'s content/progress but keeps identity + preferences, and does not touch other users', async () => {
    await prisma.user.deleteMany({ where: { username: { in: [UA, UB] } } });
    const a = await seedUser(UA);
    const b = await seedUser(UB);

    await resetUserData(prisma, a.id);

    for (const n of [
      prisma.relationship.count({ where: { userId: a.id } }),
      prisma.thread.count({ where: { userId: a.id } }),
      prisma.message.count({ where: { userId: a.id } }),
      prisma.memory.count({ where: { userId: a.id } }),
      prisma.memoryFact.count({ where: { userId: a.id } }),
      prisma.userAchievement.count({ where: { userId: a.id } }),
      prisma.activityEvent.count({ where: { userId: a.id } }),
      prisma.learningSignal.count({ where: { userId: a.id } }),
    ]) {
      expect(await n).toBe(0);
    }
    expect(await prisma.user.count({ where: { id: a.id } })).toBe(1);
    expect(await prisma.userProfile.count({ where: { userId: a.id } })).toBe(1);
    expect(await prisma.userSettings.count({ where: { userId: a.id } })).toBe(1);

    expect(await prisma.relationship.count({ where: { userId: b.id } })).toBe(1);
    expect(await prisma.message.count({ where: { userId: b.id } })).toBe(1);
    expect(await prisma.memory.count({ where: { userId: b.id } })).toBe(1);
    expect(await prisma.memoryFact.count({ where: { userId: b.id } })).toBe(1);
    expect(await prisma.userAchievement.count({ where: { userId: b.id } })).toBe(1);
    expect(await prisma.activityEvent.count({ where: { userId: b.id } })).toBe(1);
    expect(await prisma.learningSignal.count({ where: { userId: b.id } })).toBe(1);
  });
});
