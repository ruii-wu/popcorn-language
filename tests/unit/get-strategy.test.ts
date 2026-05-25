// tests/unit/get-strategy.test.ts
import { describe, it, expect } from 'vitest';
import { getMemoryStrategy } from '@/server/memory/getStrategy';

const deps = { prisma: {} as never, ollama: { embed: async () => [] as number[] } };

describe('getMemoryStrategy', () => {
  it('returns the strategy whose name matches', () => {
    expect(getMemoryStrategy('recency', deps).name).toBe('recency');
    expect(getMemoryStrategy('summary', deps).name).toBe('summary');
    expect(getMemoryStrategy('semantic', deps).name).toBe('semantic');
    expect(getMemoryStrategy('hybrid', deps).name).toBe('hybrid');
  });
  it('falls back to hybrid for unknown names', () => {
    expect(getMemoryStrategy('nonsense', deps).name).toBe('hybrid');
  });
});
