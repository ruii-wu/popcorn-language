import { describe, expect, it } from 'vitest';
import {
  correctionNotice,
  isCasualComposerDisabled,
  messageDayKey,
  messageDayLabel,
} from './chatState';

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

describe('correctionNotice', () => {
  it('uses the active NPC name in the collapsed correction prompt', () => {
    expect(correctionNotice('Emma', false)).toBe('Emma noticed something — click to see');
  });

  it('uses the compact label while the correction is expanded', () => {
    expect(correctionNotice('Lily', true)).toBe('hide');
  });
});

describe('message day formatting', () => {
  const now = new Date(2026, 7, 31, 12);

  it('labels today and yesterday relative to the current calendar day', () => {
    expect(messageDayLabel(new Date(2026, 7, 31, 9), now)).toBe('Today · 今天');
    expect(messageDayLabel(new Date(2026, 7, 30, 21), now)).toBe('Yesterday · 昨天');
  });

  it('uses a compact date for older messages and groups timestamps by calendar day', () => {
    expect(messageDayLabel(new Date(2026, 7, 26, 9), now)).toBe('Aug 26');
    expect(messageDayKey(new Date(2026, 7, 26, 9))).toBe(messageDayKey(new Date(2026, 7, 26, 22)));
  });
});
