// SQLite has no native JSON type, so the schema stores JSON-shaped data
// as TEXT. These helpers re-introduce typing at the application boundary.

export function fromJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function toJson<T>(value: T): string {
  return JSON.stringify(value ?? null);
}
