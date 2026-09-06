import { describe, expect, it } from 'vitest';
import { hybridScore, HYBRID_PARAMETERS } from '@/server/memory/strategies/hybrid';
import { WEIGHTS, weightedRecommendationScore } from '@/server/learning/recommend';

describe('production scoring formulas', () => {
  it('preserves the default hybrid formula including negative similarities', () => {
    for (const sem of [-1, 0, 0.2, 1]) {
      for (const age of [0, 72, 168, 720]) {
        expect(hybridScore(sem, age)).toBe(0.7 * sem + 0.3 * Math.pow(0.5, age / 72));
      }
    }
    expect(HYBRID_PARAMETERS).toEqual({ semanticWeight: 0.7, recencyWeight: 0.3, halfLifeHours: 72 });
  });
  it('halves only the recency contribution every half-life', () => {
    expect(hybridScore(0, 72)).toBe(0.15);
    expect(hybridScore(0, 144)).toBe(0.075);
    expect(hybridScore(0.5, 720, { semanticWeight: 1, recencyWeight: 0, halfLifeHours: 72 })).toBe(0.5);
    expect(() => hybridScore(0, 0, { ...HYBRID_PARAMETERS, halfLifeHours: 0 })).toThrow();
  });
  it('preserves recommendation rounding and component weights', () => {
    expect(WEIGHTS).toEqual({ weakness: 0.55, evidence: 0.2, cefr: 0.15, profile: 0.1 });
    for (const weakness of [0, 0.234567, 1]) {
      const components = { weakness, evidence: 0.6, cefr: 0.2, profile: 1 / 3 };
      expect(weightedRecommendationScore(components)).toBe(Number((
        0.55 * weakness + 0.2 * 0.6 + 0.15 * 0.2 + 0.1 / 3
      ).toFixed(4)));
    }
  });
});
