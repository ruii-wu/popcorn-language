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

  it('persists skillAssessments for declared target skills only, ignoring out-of-scope codes', async () => {
    const U2 = '__w4_end_signals_user__';
    await prisma.user.deleteMany({ where: { username: U2 } });
    const user = await prisma.user.create({ data: { username: U2, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2, relationshipPoints: 40 } });
    const session = await prisma.scenarioSession.create({
      data: { userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview', status: 'active', startedAt: new Date(), state: '{}' },
      include: { template: true, npc: true },
    });
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'I would say I have some experience.', scenarioSessionId: session.id } });

    const ollama = {
      chatJson: vi.fn()
        .mockResolvedValueOnce({
          grade: 'B',
          languageNote: 'Clear.',
          pragmaticsNote: 'Some hedging.',
          relationshipNote: 'Polite.',
          skillAssessments: [
            { skillCode: 'pragmatics.hedging', polarity: 'success', score: 0.7, confidence: 0.9, weight: 1, evidence: 'I would say' },
            // Not in mock_interview.targetSkills → must be dropped
            { skillCode: 'vocabulary.food_daily', polarity: 'success', score: 0.9, confidence: 0.9, weight: 1 },
            // Unknown code → must be dropped by taxonomy guard
            { skillCode: 'grammar.made_up', polarity: 'mistake', score: 0.3, confidence: 0.9, weight: 1 },
          ],
        })
        .mockResolvedValueOnce({ title: 'x', body: 'y' }),
      embed: vi.fn(),
    };

    const events: SseEvent[] = [];
    for await (const e of runScenarioEnd({ prisma, ollama, session, state: { impression: 6, stress: 'Low', turnsLeft: 0, turnIndex: 6 } })) events.push(e);

    const stored = await prisma.learningSignal.findMany({ where: { userId: user.id, scenarioSessionId: session.id } });
    expect(stored.map((s) => s.skillCode)).toEqual(['pragmatics.hedging']);
    expect(stored[0].sourceType).toBe('scenario_summary');
    expect(stored[0].sourceRef).toBe(session.id);
    expect(stored[0].polarity).toBe('success');

    const written = await prisma.scenarioSummary.findUniqueOrThrow({ where: { sessionId: session.id } });
    const pre = JSON.parse(written.preLevels) as Record<string, { level: number; evidenceN: number }>;
    const post = JSON.parse(written.postLevels) as Record<string, { level: number; evidenceN: number }>;
    // pre + post are keyed by mock_interview target skills
    expect(Object.keys(pre).sort()).toEqual([
      'interaction.describing_experience',
      'pragmatics.formal_register',
      'pragmatics.hedging',
      'vocabulary.interview',
    ]);
    expect(Object.keys(post).sort()).toEqual(Object.keys(pre).sort());
    // hedging received a success signal → post.level > pre.level and evidenceN increased
    expect(post['pragmatics.hedging'].level).toBeGreaterThan(pre['pragmatics.hedging'].level);
    expect(post['pragmatics.hedging'].evidenceN).toBe(pre['pragmatics.hedging'].evidenceN + 1);
    // untouched skills stay the same
    expect(post['vocabulary.interview'].level).toBeCloseTo(pre['vocabulary.interview'].level);
    expect(post['vocabulary.interview'].evidenceN).toBe(pre['vocabulary.interview'].evidenceN);

    // SSE scenario_end payload must include the learningUpdate the frontend renders.
    const endEvent = events.find((e) => e.event === 'scenario_end');
    expect(endEvent).toBeDefined();
    const summary = (endEvent!.data as { summary: { learningUpdate?: Array<{ skillCode: string; delta: number; status: string }> } }).summary;
    expect(summary.learningUpdate).toBeDefined();
    const hedging = summary.learningUpdate!.find((u) => u.skillCode === 'pragmatics.hedging');
    expect(hedging).toBeDefined();
    expect(hedging!.delta).toBeGreaterThan(0);
    // evidenceN=1 for hedging (single success this session) → still 'gathering' bucket
    expect(hedging!.status).toBe('gathering');
    await prisma.user.deleteMany({ where: { username: U2 } });
  });

  it('rolls back the completion tail and retries without duplicating progression', async () => {
    const username = '__w4_end_retry_user__';
    await prisma.user.deleteMany({ where: { username } });
    const user = await prisma.user.create({ data: { username, password: 'pw', cefrLevel: 'B1' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({
      data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2, relationshipPoints: 40 },
    });
    const session = await prisma.scenarioSession.create({
      data: {
        userId: user.id,
        npcId: 'lily',
        threadId: thread.id,
        templateId: 'mock_interview',
        status: 'active',
        startedAt: new Date(),
        state: '{}',
      },
      include: { template: true, npc: true },
    });
    await prisma.message.create({
      data: {
        threadId: thread.id,
        userId: user.id,
        role: 'user',
        text: 'I speak with client yesterday.',
        scenarioSessionId: session.id,
      },
    });

    let failCompletionEvent = true;
    prisma.$use(async (params, next) => {
      if (
        failCompletionEvent
        && params.model === 'ActivityEvent'
        && params.action === 'create'
        && (params.args.data as { type?: string }).type === 'scenario_completed'
      ) {
        failCompletionEvent = false;
        throw new Error('injected completion write failure');
      }
      return next(params);
    });

    const firstSummary = {
      grade: 'B',
      languageNote: 'Watch the past tense.',
      pragmaticsNote: 'Clear intent.',
      relationshipNote: 'Good effort.',
      skillAssessments: [{
        skillCode: 'interaction.describing_experience',
        polarity: 'mistake' as const,
        score: 0.2,
        confidence: 0.9,
        weight: 1,
        evidence: 'I speak with client yesterday',
      }],
    };
    const retrySummary = {
      ...firstSummary,
      skillAssessments: [{
        ...firstSummary.skillAssessments[0],
        score: 0.9,
        polarity: 'success' as const,
      }],
    };
    const ollama = {
      chatJson: vi.fn()
        .mockResolvedValueOnce(firstSummary)
        .mockResolvedValueOnce(retrySummary)
        .mockResolvedValueOnce({ title: 'Keeps Trying', body: 'Stayed composed during interview practice.' }),
      embed: vi.fn(),
    };
    const consume = async () => {
      const events: SseEvent[] = [];
      for await (const event of runScenarioEnd({
        prisma,
        ollama,
        session,
        state: { impression: 5, stress: 'Medium', turnsLeft: 0, turnIndex: 6 },
      })) events.push(event);
      return events;
    };

    await expect(consume()).rejects.toThrow('injected completion write failure');
    expect((await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('active');
    expect(await prisma.scenarioSummary.count({ where: { sessionId: session.id } })).toBe(0);
    expect(await prisma.message.count({ where: { scenarioSessionId: session.id, role: 'summary' } })).toBe(0);
    expect(await prisma.activityEvent.count({ where: { userId: user.id, type: 'scenario_completed' } })).toBe(0);
    // Signals are part of the completion transaction and roll back with it.
    expect(await prisma.learningSignal.count({ where: { scenarioSessionId: session.id } })).toBe(0);
    const beforeRetry = await prisma.relationship.findUniqueOrThrow({
      where: { userId_npcId: { userId: user.id, npcId: 'lily' } },
    });
    expect(beforeRetry.relationshipPoints).toBe(40);
    expect(beforeRetry.scenarioCount).toBe(0);

    const events = await consume();
    const reloaded = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(reloaded.status).toBe('completed');
    expect(await prisma.scenarioSummary.count({ where: { sessionId: session.id } })).toBe(1);
    expect(await prisma.message.count({ where: { scenarioSessionId: session.id, role: 'summary' } })).toBe(1);
    expect(await prisma.activityEvent.count({ where: { userId: user.id, type: 'scenario_completed' } })).toBe(1);
    const afterRetry = await prisma.relationship.findUniqueOrThrow({
      where: { userId_npcId: { userId: user.id, npcId: 'lily' } },
    });
    expect(afterRetry.relationshipPoints).toBe(48);
    expect(afterRetry.scenarioCount).toBe(1);

    const end = events.find((event) => event.event === 'scenario_end')?.data as {
      summary: { learningUpdate: Array<{ skillCode: string; delta: number }> };
    };
    expect(end.summary.learningUpdate.find(
      (item) => item.skillCode === 'interaction.describing_experience',
    )?.delta).toBeGreaterThan(0);
    const storedSignal = await prisma.learningSignal.findFirstOrThrow({
      where: { scenarioSessionId: session.id, skillCode: 'interaction.describing_experience' },
    });
    expect(storedSignal.polarity).toBe('success');
    expect(storedSignal.score).toBe(0.9);
    const storedSummary = await prisma.scenarioSummary.findUniqueOrThrow({ where: { sessionId: session.id } });
    expect(storedSummary.languageNote).toBe(retrySummary.languageNote);
    await prisma.user.deleteMany({ where: { username } });
  });

  it('retries a failed Memory card without re-evaluating a completed scenario', async () => {
    const username = '__w4_end_memory_retry_user__';
    await prisma.user.deleteMany({ where: { username } });
    const user = await prisma.user.create({ data: { username, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
    const session = await prisma.scenarioSession.create({
      data: {
        userId: user.id, npcId: 'lily', threadId: thread.id, templateId: 'mock_interview',
        status: 'active', startedAt: new Date(), state: JSON.stringify({ turnsLeft: 0 }),
      },
      include: { template: true, npc: true },
    });
    await prisma.message.create({
      data: { threadId: thread.id, userId: user.id, role: 'user', text: 'Final answer', scenarioSessionId: session.id },
    });

    const summary = { grade: 'B+', languageNote: 'Clear.', pragmaticsNote: 'Polite.', relationshipNote: 'Warm.' };
    const firstOllama = {
      chatJson: vi.fn().mockResolvedValueOnce(summary).mockRejectedValueOnce(new Error('memory unavailable')),
      embed: vi.fn(),
    };
    for await (const _event of runScenarioEnd({
      prisma, ollama: firstOllama, session,
      state: { impression: 5, stress: 'Medium', turnsLeft: 0, turnIndex: 1 },
    })) { /* drain */ }
    expect(await prisma.memory.count({ where: { userId: user.id, sourceRef: session.id } })).toBe(0);

    const retryOllama = {
      chatJson: vi.fn().mockResolvedValue({ title: 'Clear Communicator', body: 'Stayed clear under pressure.' }),
      embed: vi.fn(),
    };
    const retryEvents: SseEvent[] = [];
    for await (const event of runScenarioEnd({
      prisma, ollama: retryOllama, session,
      state: { impression: 5, stress: 'Medium', turnsLeft: 0, turnIndex: 1 },
    })) retryEvents.push(event);

    expect(retryOllama.chatJson).toHaveBeenCalledTimes(1); // Memory only; Summary is reused.
    expect(await prisma.memory.count({ where: { userId: user.id, sourceRef: session.id } })).toBe(1);
    expect(retryEvents.some((event) => event.event === 'scenario_end')).toBe(true);
    await prisma.user.deleteMany({ where: { username } });
  });
});
