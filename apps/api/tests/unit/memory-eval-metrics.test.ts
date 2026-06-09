// tests/unit/memory-eval-metrics.test.ts
import { describe, it, expect } from 'vitest';
import { estimateTokens, recallAtK, toMarkdownTable } from '@/server/memory/eval/metrics';

describe('estimateTokens', () => {
  it('approximates ~1 token per 4 chars, with a floor of 1', () => {
    expect(estimateTokens('')).toBe(1);
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('12345678')).toBe(2); // 8/4
    expect(estimateTokens('  abcd  ')).toBe(1); // trimmed to 4 chars
  });
});

describe('recallAtK', () => {
  it('is the fraction of relevant ids present in the retrieved list', () => {
    expect(recallAtK(['a', 'b', 'c'], ['a', 'b'])).toBe(1);
    expect(recallAtK(['a', 'x', 'y'], ['a', 'b'])).toBe(0.5);
    expect(recallAtK(['x', 'y'], ['a', 'b'])).toBe(0);
  });

  it('does not double-count and ignores retrieved ids that are not relevant', () => {
    expect(recallAtK(['a', 'a', 'z'], ['a', 'b'])).toBe(0.5);
  });

  it('returns 1 when there are no relevant ids (nothing to miss)', () => {
    expect(recallAtK(['a'], [])).toBe(1);
  });
});

describe('toMarkdownTable', () => {
  it('renders a strategy comparison table', () => {
    const md = toMarkdownTable([
      { name: 'recency', recallAtK: 0.125, latencyMs: 2, tokenCost: 18 },
      { name: 'semantic', recallAtK: 1, latencyMs: 5, tokenCost: 20 },
    ]);
    expect(md).toContain('| Strategy | recall@k | Latency (ms) | Token cost |');
    expect(md).toContain('| recency | 0.125 | 2 | 18 |');
    expect(md).toContain('| semantic | 1 | 5 | 20 |');
  });
});
