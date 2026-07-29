export const PROFILE_ROLES = [
  'Student',
  'Software engineer',
  'Designer',
  'Marketer',
  'Researcher',
  'Something else',
] as const;

export const PROFILE_GOALS = [
  { id: 'work', label: 'Work', zh: '工作' },
  { id: 'travel', label: 'Travel', zh: '旅行' },
  { id: 'study', label: 'Study abroad', zh: '留学' },
  { id: 'daily', label: 'Daily life', zh: '日常' },
] as const;

export const PROFILE_INTERESTS = [
  'Coffee',
  'Movies',
  'Tech',
  'Sports',
  'Cats',
  'Cooking',
  'Art',
  'Gaming',
  'Books',
  'Music',
] as const;

export function sameProfileOption(a: string | null | undefined, b: string): boolean {
  return !!a && a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

export function mergeProfileOptions(base: readonly string[], current: readonly string[]): string[] {
  const merged = [...base];
  for (const value of current) {
    if (value.trim() && !merged.some((option) => sameProfileOption(option, value))) merged.push(value);
  }
  return merged;
}

export function toggleProfileInterest(selected: readonly string[], value: string, max = 5): string[] {
  const existing = selected.findIndex((interest) => sameProfileOption(interest, value));
  if (existing >= 0) return selected.filter((_, index) => index !== existing);
  if (selected.length >= max) return [...selected];
  return [...selected, value];
}
