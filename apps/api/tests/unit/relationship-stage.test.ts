import { describe, it, expect } from 'vitest';
import { stageForPoints } from '@/server/relationship/stage';

describe('stageForPoints', () => {
  it('maps hidden points to a stage + stageValue at the spec thresholds', () => {
    expect(stageForPoints(0)).toEqual({ stage: 'acquaintance', stageValue: 1 });
    expect(stageForPoints(29)).toEqual({ stage: 'acquaintance', stageValue: 1 });
    expect(stageForPoints(30)).toEqual({ stage: 'friend', stageValue: 2 });
    expect(stageForPoints(69)).toEqual({ stage: 'friend', stageValue: 2 });
    expect(stageForPoints(70)).toEqual({ stage: 'close', stageValue: 3 });
    expect(stageForPoints(100)).toEqual({ stage: 'close', stageValue: 3 });
  });
});
