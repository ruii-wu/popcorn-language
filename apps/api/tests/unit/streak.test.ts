import { describe, it, expect } from 'vitest';
import { computeStreak } from '@/server/users/streak';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

describe('computeStreak', () => {
  it('counts consecutive days ending today', () => {
    const now = at(2026, 5, 25);
    const r = computeStreak([at(2026, 5, 25), at(2026, 5, 24), at(2026, 5, 23)], now);
    expect(r.days).toBe(3);
    expect(r.weekCount).toBe(3);
    expect(r.perDay).toEqual([0, 0, 0, 0, 1, 1, 1]); // index 6 = today
  });

  it('allows a streak that ends yesterday (today not yet active)', () => {
    const now = at(2026, 5, 25);
    const r = computeStreak([at(2026, 5, 24), at(2026, 5, 23)], now);
    expect(r.days).toBe(2);
  });

  it('breaks the streak on a gap and dedups multiple events per day', () => {
    const now = at(2026, 5, 25);
    const r = computeStreak([at(2026, 5, 25), at(2026, 5, 25), at(2026, 5, 22)], now);
    expect(r.days).toBe(1);
    expect(r.weekCount).toBe(2); // 25th and 22nd are distinct active days
  });

  it('returns zeros for no activity', () => {
    expect(computeStreak([], at(2026, 5, 25))).toEqual({ days: 0, weekCount: 0, perDay: [0, 0, 0, 0, 0, 0, 0] });
  });
});
