import { describe, expect, it } from 'vitest';
import { isCasualComposerDisabled } from './chatState';

describe('isCasualComposerDisabled', () => {
  it('disables sending while a recall request is in flight', () => {
    expect(isCasualComposerDisabled({
      sending: false,
      recallingId: 'message-1',
      acceptingScenario: false,
      decliningScenario: false,
    })).toBe(true);
  });

  it('allows an idle casual composer', () => {
    expect(isCasualComposerDisabled({
      sending: false,
      recallingId: null,
      acceptingScenario: false,
      decliningScenario: false,
    })).toBe(false);
  });
});
