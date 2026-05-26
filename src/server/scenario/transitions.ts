// src/server/scenario/transitions.ts
export type ScenarioStatus =
  | 'invited' | 'accepted' | 'active' | 'paused' | 'completed' | 'declined' | 'aborted';

export const TERMINAL: ScenarioStatus[] = ['completed', 'declined', 'aborted'];

const ALLOWED: Record<ScenarioStatus, ScenarioStatus[]> = {
  invited: ['active', 'accepted', 'declined', 'aborted'],
  accepted: ['active', 'aborted'],
  active: ['paused', 'completed', 'aborted'],
  paused: ['active', 'aborted'],
  completed: [],
  declined: [],
  aborted: [],
};

export function isTerminal(status: string): boolean {
  return TERMINAL.includes(status as ScenarioStatus);
}

export function canTransition(from: string, to: string): boolean {
  const next = ALLOWED[from as ScenarioStatus];
  return Array.isArray(next) && next.includes(to as ScenarioStatus);
}
