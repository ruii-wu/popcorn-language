// tests/unit/scenario-state.test.ts
import { describe, it, expect } from 'vitest';
import { initState, applyDelta, clampImpression, type ScenarioState } from '@/server/scenario/state';

describe('scenario state', () => {
  it('initState seeds impression 5, role stress, turnsLeft from template, turnIndex 0', () => {
    const s = initState({ estimatedTurns: 6 }, { defaultStress: 'Medium' });
    expect(s).toEqual({ impression: 5, stress: 'Medium', turnsLeft: 6, turnIndex: 0 });
  });

  it('initState falls back to Medium stress and 6 turns', () => {
    const s = initState({ estimatedTurns: 0 }, undefined);
    expect(s.stress).toBe('Medium');
    expect(s.turnsLeft).toBe(6);
  });

  it('applyDelta adds the impression delta, sets stress, decrements turnsLeft, bumps turnIndex', () => {
    const before: ScenarioState = { impression: 5, stress: 'Low', turnsLeft: 4, turnIndex: 1 };
    const after = applyDelta(before, { impression: 2, stress: 'High' });
    expect(after).toEqual({ impression: 7, stress: 'High', turnsLeft: 3, turnIndex: 2 });
  });

  it('clamps impression to 0..10 and never lets turnsLeft go below 0', () => {
    expect(clampImpression(12)).toBe(10);
    expect(clampImpression(-4)).toBe(0);
    const after = applyDelta({ impression: 9, stress: 'Low', turnsLeft: 0, turnIndex: 9 }, { impression: 5, stress: 'Low' });
    expect(after.impression).toBe(10);
    expect(after.turnsLeft).toBe(0);
  });
});
