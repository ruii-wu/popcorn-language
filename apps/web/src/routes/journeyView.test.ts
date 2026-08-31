import { describe, expect, it } from 'vitest';
import { countFriendships, formatLastChat } from './journeyView';

describe('journey relationship display', () => {
  it('counts only friend and close-friend relationships', () => {
    expect(countFriendships([
      { npcId: 'lily', name: 'Lily', stage: 'close', stageValue: 3, note: null, last: null },
      { npcId: 'emma', name: 'Emma', stage: 'friend', stageValue: 2, note: null, last: null },
      { npcId: 'chen', name: 'Mr. Chen', stage: 'acquaintance', stageValue: 1, note: null, last: null },
    ])).toBe(2);
  });

  it('renders relationship activity as a compact date instead of raw ISO', () => {
    expect(formatLastChat('2026-08-27T12:43:36.043Z')).toBe('Aug 27');
  });
});
