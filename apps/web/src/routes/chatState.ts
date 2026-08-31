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

export function correctionNotice(npcName: string, expanded: boolean): string {
  return expanded ? 'hide' : `${npcName} noticed something — click to see`;
}

export function messageDayKey(value: string | number | Date): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function messageDayLabel(value: string | number | Date, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Earlier';
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const daysAgo = Math.round((currentDay - targetDay) / 86_400_000);
  if (daysAgo === 0) return 'Today · 今天';
  if (daysAgo === 1) return 'Yesterday · 昨天';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}
