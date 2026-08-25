// tests/integration/memory-card.test.ts
import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { generateMemoryCard } from '@/server/memory/memoryCard';

const prisma = new PrismaClient();
const U = '__w4_memcard_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('generateMemoryCard', () => {
  it('creates a scenario Memory card from the transcript', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const ollama = {
      chatJson: vi.fn().mockResolvedValue({ title: 'Composed Under Pressure', body: 'Stayed calm and structured answers when challenged.' }),
      embed: vi.fn(),
    };

    const mem = await generateMemoryCard({
      prisma, ollama, userId: user.id, npcId: 'lily', sessionId: 'sess_x',
      transcript: 'NPC: Why this role?\nUser: Because I value the mission.', grade: 'A',
    });

    expect(mem).not.toBeNull();
    expect(mem!.title).toBe('Composed Under Pressure');
    expect(mem!.sourceType).toBe('scenario');
    expect(mem!.sourceRef).toBe('sess_x');
    expect(mem!.npcId).toBe('lily');

    const surfaced = await prisma.memory.findMany({ where: { userId: user.id, dismissedAt: null } });
    expect(surfaced).toHaveLength(1);
  });

  it('returns null (never throws) when the LLM fails', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const ollama = { chatJson: vi.fn().mockRejectedValue(new Error('down')), embed: vi.fn() };
    const mem = await generateMemoryCard({ prisma, ollama, userId: user.id, npcId: 'lily', sessionId: 's2', transcript: 'x', grade: 'B' });
    expect(mem).toBeNull();
  });

  it('is idempotent for repeated generation of the same scenario source', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const ollama = {
      chatJson: vi.fn()
        .mockResolvedValueOnce({ title: 'First Card', body: 'First body.' })
        .mockResolvedValueOnce({ title: 'Second Card', body: 'Second body.' }),
    };
    const deps = { prisma, ollama, userId: user.id, npcId: 'lily', sessionId: 'same-session', transcript: 'x', grade: 'B' };
    const first = await generateMemoryCard(deps);
    const second = await generateMemoryCard(deps);

    expect(second?.id).toBe(first?.id);
    expect(second?.title).toBe('First Card');
    expect(await prisma.memory.count({ where: { userId: user.id, sourceRef: 'same-session' } })).toBe(1);
  });
});
