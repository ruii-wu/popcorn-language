// tests/integration/scenario-e2e.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OllamaClient } from '@/server/llm/ollama';
import { streamChat } from '@/server/chat/streamChat';
import { acceptScenario } from '@/server/scenario/accept';
import { runScenarioTurn } from '@/server/scenario/turn';
import type { SseEvent } from '@/server/sse/events';

const prisma = new PrismaClient();
const U = '__w4_e2e_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

function ndjson(lines: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const l of lines) c.enqueue(enc.encode(l + '\n')); c.close(); } });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe('scenario A→B→C→D end to end', () => {
  it('offers → accepts → runs a final turn → grades, cards, and levels up the relationship', async () => {
    // ---- A: a friend who has warmed up the thread, just below the "close" threshold ----
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2, relationshipPoints: 65 } });
    for (let i = 0; i < 4; i++) await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: `warmup ${i}` } });

    // ---- B: casual turn mentioning "interview" → scenario_offer ----
    const chatFetch = vi.fn(async (_url: string, init: { body: string }) => {
      const b = JSON.parse(init.body);
      if (b.stream === true) return ndjson([JSON.stringify({ message: { content: "sure, let's!" }, done: true })]);
      return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ facts: [] }) } }) } as unknown as Response;
    });
    const chatOllama = new OllamaClient({ fetchImpl: chatFetch as unknown as typeof fetch });

    const bEvents: SseEvent[] = [];
    for await (const e of streamChat({ prisma, ollama: chatOllama, userId: user.id, npcId: 'lily', text: 'can we run a mock interview?' })) bEvents.push(e);
    const offer = bEvents.find((e) => e.event === 'scenario_offer')!.data as { sessionId: string };
    expect(offer.sessionId).toBeTruthy();

    // ---- C: accept → opening, then one final turn ----
    const scenarioOllama = {
      chatJson: vi.fn()
        .mockResolvedValueOnce({ npcReply: 'Welcome. Tell me about yourself.', stateDelta: { impression: 0, stress: 'Medium' }, isFinalTurn: false, suggestedChoicesNext: [{ id: 'c1', text: 'I am a developer.', tone: 'Confident', desc: '' }] })
        .mockResolvedValueOnce({ npcReply: 'Great, thank you — that concludes our interview.', stateDelta: { impression: 2, stress: 'Low' }, isFinalTurn: true, suggestedChoicesNext: [] })
        .mockResolvedValueOnce({ grade: 'A', languageNote: 'Clear, structured answers.', pragmaticsNote: 'Polite and composed.', relationshipNote: 'Built genuine rapport.' })
        .mockResolvedValueOnce({ title: 'Composed Under Pressure', body: 'Keeps answers structured and calm when challenged.' }),
      embed: vi.fn(),
    };

    const accept = await acceptScenario({ prisma, ollama: scenarioOllama, userId: user.id, sessionId: offer.sessionId });
    expect(accept.session.status).toBe('active');
    expect(accept.openingMessage.text).toContain('Welcome');

    const dEvents: SseEvent[] = [];
    for await (const e of runScenarioTurn({ prisma, ollama: scenarioOllama, userId: user.id, sessionId: offer.sessionId, choiceId: 'c1', tone: 'Confident', text: 'I am a developer who values impact.' })) dEvents.push(e);

    // ---- D: payoff ----
    const end = dEvents.find((e) => e.event === 'scenario_end')!.data as { summary: { grade: string }; memoryId: string | null; relationshipChange: { from: string; to: string } | null };
    expect(end.summary.grade).toBe('A');
    expect(end.memoryId).toBeTruthy();
    expect(end.relationshipChange).toEqual({ from: 'friend', to: 'close' });

    const session = await prisma.scenarioSession.findUniqueOrThrow({ where: { id: offer.sessionId } });
    expect(session.status).toBe('completed');
    expect(await prisma.scenarioSummary.count({ where: { sessionId: session.id } })).toBe(1);
    const memCard = await prisma.memory.findFirst({ where: { userId: user.id, sourceType: 'scenario', sourceRef: session.id } });
    expect(memCard?.title).toBe('Composed Under Pressure');
    const rel = await prisma.relationship.findUniqueOrThrow({ where: { userId_npcId: { userId: user.id, npcId: 'lily' } } });
    expect(rel.stage).toBe('close');
    expect(rel.relationshipPoints).toBe(78);
    expect(await prisma.activityEvent.count({ where: { userId: user.id, type: 'scenario_completed' } })).toBe(1);
  });
});
