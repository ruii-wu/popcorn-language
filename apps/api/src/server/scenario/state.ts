// src/server/scenario/state.ts
export type Stress = 'Low' | 'Medium' | 'High';

export interface ScenarioState {
  impression: number; // 0..10
  stress: Stress;
  turnsLeft: number; // soft pacing target; reaching zero does not force completion
  turnIndex: number;
  completionPending?: boolean;
}

export interface StateDelta {
  impression: number; // small signed delta
  stress: Stress;
}

export function clampImpression(n: number): number {
  return Math.max(0, Math.min(10, n));
}

export function initState(
  template: { estimatedTurns: number },
  role: { defaultStress?: string } | undefined,
): ScenarioState {
  const stress = (role?.defaultStress as Stress) ?? 'Medium';
  return {
    impression: 5,
    stress: ['Low', 'Medium', 'High'].includes(stress) ? stress : 'Medium',
    turnsLeft: template.estimatedTurns > 0 ? template.estimatedTurns : 6,
    turnIndex: 0,
  };
}

export function applyDelta(state: ScenarioState, delta: StateDelta): ScenarioState {
  return {
    impression: clampImpression(state.impression + (delta.impression ?? 0)),
    stress: delta.stress ?? state.stress,
    turnsLeft: Math.max(0, state.turnsLeft - 1),
    turnIndex: state.turnIndex + 1,
    ...(state.completionPending === undefined ? {} : { completionPending: state.completionPending }),
  };
}

export function hardTurnLimit(template: { estimatedTurns: number }): number {
  const target = template.estimatedTurns > 0 ? template.estimatedTurns : 6;
  return target + 3;
}
