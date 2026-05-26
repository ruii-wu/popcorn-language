// tests/integration/scenario-end.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { runScenarioEnd } from '@/server/scenario/end';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const U = '__w4_end_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('runScenarioEnd', () => {
  it('writes summary + memory card, applies the grade, completes the session, emits scenario_end', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2, relationshipPoints: 65 } });
    const session = await prisma.scenarioSession.create({
      data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'active', startedAt: new Date(), state: '{}' },
      include: { template: true, npc: true },
    });
    await prisma.message.create({ data: { threadId: thread.id, userId: null, role: 'npc-roleplay', text: 'Why this role?', scenarioSessionId: session.id } });
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'I value the mission.', scenarioSessionId: session.id } });

    const ollama = {
      chatJson: vi.fn()
        .mockResolvedValueOnce({ grade: 'A', languageNote: 'Clear sentences.', pragmaticsNote: 'Polite hedging.', relationshipNote: 'Warmer rapport.' })
        .mockResolvedValueOnce({ title: 'Mission-Driven', body: 'Frames answers around purpose.' }),
      embed: vi.fn(),
    };

    const events: SseEvent[] = [];
    for await (const e of runScenarioEnd({ prisma, ollama, session, state: { impression: 8, stress: 'Low', turnsLeft: 0, turnIndex: 6 } })) {
      events.push(e);
    }

    const end = events.find((e) => e.event === 'scenario_end')!.data as { summary: { grade: string }; memoryId: string | null; relationshipChange: unknown };
    expect(end.summary.grade).toBe('A');
    expect(end.memoryId).toBeTruthy();
    expect(end.relationshipChange).toEqual({ from: 'friend', to: 'close' });

    const reloaded = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(reloaded.status).toBe('completed');
    expect(reloaded.endedAt).not.toBeNull();
    expect(await prisma.scenarioSummary.count({ where: { sessionId: session.id } })).toBe(1);
    expect(await prisma.message.count({ where: { scenarioSessionId: session.id, role: 'summary' } })).toBe(1);
    expect(await prisma.activityEvent.count({ where: { userId: user.id, type: 'scenario_completed' } })).toBe(1);
  });

  it('falls back to grade "—" and still completes when the summary LLM fails', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const thread = await prisma.thread.findFirstOrThrow({ where: { userId: user.id, npcId: 'lily' } });
    const session = await prisma.scenarioSession.create({
      data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'active', startedAt: new Date(), state: '{}' },
      include: { template: true, npc: true },
    });
    const ollama = { chatJson: vi.fn().mockRejectedValue(new Error('down')), embed: vi.fn() };
    const events: SseEvent[] = [];
    for await (const e of runScenarioEnd({ prisma, ollama, session, state: { impression: 5, stress: 'Medium', turnsLeft: 0, turnIndex: 6 } })) events.push(e);
    const end = events.find((e) => e.event === 'scenario_end')!.data as { summary: { grade: string } };
    expect(end.summary.grade).toBe('—');
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('completed');
  });
});
