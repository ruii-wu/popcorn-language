import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runAchievementTick, buildAchievementContext } from '@/server/achievements/engine';

const prisma = new PrismaClient();
const U = '__w5_achievement_engine_user__';

async function reset() { await prisma.user.deleteMany({ where: { username: U } }); }
beforeEach(reset);
afterAll(async () => { await reset(); await prisma.$disconnect(); });

describe('achievement engine', () => {
  it('unlocks first_chat after one message and is idempotent on re-tick', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'Hello' } });
    await prisma.activityEvent.create({ data: { userId: user.id, type: 'message_sent', payload: JSON.stringify({ npcId: 'lily' }) } });

    const first = await runAchievementTick(prisma, user.id);
    expect(first).toContain('first_chat');
    const again = await runAchievementTick(prisma, user.id);
    expect(again).not.toContain('first_chat');
    expect(await prisma.userAchievement.count({ where: { userId: user.id, achievementId: 'first_chat' } })).toBe(1);
  });

  it('unlocks scenario_survivor + polite_mode for a completed B+ scenario', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    const session = await prisma.scenarioSession.create({
      data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'completed' },
    });
    await prisma.scenarioSummary.create({
      data: { sessionId: session.id, grade: 'B+', languageNote: '', pragmaticsNote: '', relationshipNote: '' },
    });

    const unlocked = await runAchievementTick(prisma, user.id);
    expect(unlocked).toEqual(expect.arrayContaining(['scenario_survivor', 'polite_mode']));
  });

  it('builds bestGrade and bilingual flags into the context', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: '早上好 morning', langDetect: 'mixed' } });

    const ctx = await buildAchievementContext(prisma, user.id);
    expect(ctx.hasBilingualThread).toBe(true);
    expect(ctx.totalNpcs).toBeGreaterThanOrEqual(1);
  });

  it('excludes retracted messages and hidden scenarios from rollback-aware context', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.message.create({
      data: { threadId: thread.id, userId: user.id, role: 'user', text: 'hidden', retractedAt: new Date(), langDetect: 'mixed' },
    });
    const session = await prisma.scenarioSession.create({
      data: {
        userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview',
        status: 'completed', hiddenAt: new Date(),
      },
    });
    await prisma.scenarioSummary.create({
      data: { sessionId: session.id, grade: 'A', languageNote: '', pragmaticsNote: '', relationshipNote: '' },
    });

    const ctx = await buildAchievementContext(prisma, user.id);
    expect(ctx.messageSentCount).toBe(0);
    expect(ctx.completedScenarioCount).toBe(0);
    expect(ctx.bestGrade).toBe('—');
    expect(ctx.hasBilingualThread).toBe(false);
  });
});
