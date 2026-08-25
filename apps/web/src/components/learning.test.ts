import { describe, it, expect } from 'vitest';
import { STATUS_LABEL, statusColor, trendGlyph } from './learning';

describe('learning UI helpers', () => {
  it('every status has a human label', () => {
    for (const s of ['gathering', 'needs_practice', 'developing', 'solid', 'strong'] as const) {
      expect(STATUS_LABEL[s]).toBeTruthy();
    }
  });

  it('needs_practice uses the coral (attention) palette', () => {
    const c = statusColor('needs_practice');
    expect(c.bg).toContain('coral');
    expect(c.ink).toContain('coral');
  });

  it('strong/solid use the moss (positive) palette', () => {
    expect(statusColor('strong').ink).toContain('moss');
    expect(statusColor('solid').ink).toContain('moss');
  });

  it('trendGlyph uses distinct symbols per trend', () => {
    const up = trendGlyph('improving');
    const down = trendGlyph('declining');
    const flat = trendGlyph('stable');
    expect(new Set([up, down, flat]).size).toBe(3);
  });
});
