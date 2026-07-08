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

export function isKnownToNpc(raw: string, npcId: string): boolean {
  try {
    const ids = JSON.parse(raw) as unknown;
    return Array.isArray(ids) && (ids.length === 0 || ids.includes(npcId));
  } catch {
    return false;
  }
}
