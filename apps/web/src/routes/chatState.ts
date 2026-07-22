export interface CasualComposerState {
  sending: boolean;
  recallingId: string | null;
  acceptingScenario: boolean;
  decliningScenario: boolean;
}

export function isCasualComposerDisabled(state: CasualComposerState): boolean {
  return state.sending
    || !!state.recallingId
    || state.acceptingScenario
    || state.decliningScenario;
}
