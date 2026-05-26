// tests/unit/scenario-transitions.test.ts
import { describe, it, expect } from 'vitest';
import { canTransition, isTerminal } from '@/server/scenario/transitions';

describe('scenario transitions', () => {
  it('allows the happy path', () => {
    expect(canTransition('invited', 'active')).toBe(true);
    expect(canTransition('active', 'paused')).toBe(true);
    expect(canTransition('paused', 'active')).toBe(true);
    expect(canTransition('active', 'completed')).toBe(true);
  });

  it('allows decline only from invited and abort from non-terminal states', () => {
    expect(canTransition('invited', 'declined')).toBe(true);
    expect(canTransition('active', 'declined')).toBe(false);
    expect(canTransition('active', 'aborted')).toBe(true);
    expect(canTransition('paused', 'aborted')).toBe(true);
  });

  it('forbids transitions out of terminal states', () => {
    expect(canTransition('completed', 'active')).toBe(false);
    expect(canTransition('declined', 'active')).toBe(false);
    expect(canTransition('aborted', 'active')).toBe(false);
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('invited')).toBe(false);
  });
});
