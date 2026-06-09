// src/server/relationship/stage.ts
// Single source of truth for the hidden-points → relationship-stage mapping (spec §七 M5).
// Thresholds: friend at 30, close at 70.
export interface StageInfo { stage: string; stageValue: number }

export function stageForPoints(points: number): StageInfo {
  if (points >= 70) return { stage: 'close', stageValue: 3 };
  if (points >= 30) return { stage: 'friend', stageValue: 2 };
  return { stage: 'acquaintance', stageValue: 1 };
}
