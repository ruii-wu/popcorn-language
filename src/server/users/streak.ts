export interface StreakResult {
  days: number;
  weekCount: number;
  perDay: number[]; // length 7; index 0 = 6 days ago, index 6 = today
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function computeStreak(dates: Date[], now: Date = new Date()): StreakResult {
  const active = new Set(dates.map(dayKey));

  const perDay: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    perDay.push(active.has(dayKey(d)) ? 1 : 0);
  }
  const weekCount = perDay.reduce((a, b) => a + b, 0);

  let days = 0;
  const cursor = new Date(now);
  if (!active.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1); // allow streak through yesterday
  while (active.has(dayKey(cursor))) {
    days++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { days, weekCount, perDay };
}
