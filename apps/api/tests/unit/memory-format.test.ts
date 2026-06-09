// tests/unit/memory-format.test.ts
import { describe, it, expect } from 'vitest';
import { factToText, parseEmbedding } from '@/server/memory/format';

describe('memory format helpers', () => {
  it('factToText humanizes predicate and joins value', () => {
    expect(factToText('has_pet', 'a cat named Mochi')).toBe('has pet: a cat named Mochi');
    expect(factToText('works_as', 'software engineer')).toBe('works as: software engineer');
  });
  it('parseEmbedding parses a JSON number array, else null', () => {
    expect(parseEmbedding('[0.1,0.2,0.3]')).toEqual([0.1, 0.2, 0.3]);
    expect(parseEmbedding(null)).toBeNull();
    expect(parseEmbedding('not json')).toBeNull();
    expect(parseEmbedding('{"a":1}')).toBeNull();
  });
});
