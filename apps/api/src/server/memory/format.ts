// src/server/memory/format.ts
export function factToText(predicate: string, value: string): string {
  return `${predicate.replace(/_/g, ' ')}: ${value}`;
}

export function parseEmbedding(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.every((n) => typeof n === 'number') ? (v as number[]) : null;
  } catch {
    return null;
  }
}
