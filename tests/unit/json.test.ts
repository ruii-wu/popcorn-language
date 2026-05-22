import { describe, expect, it } from 'vitest';
import { fromJson, toJson } from '@/lib/db/json';

describe('db/json helpers', () => {
  describe('fromJson', () => {
    it('returns fallback for null', () => {
      expect(fromJson<number[]>(null, [])).toEqual([]);
    });

    it('returns fallback for undefined', () => {
      expect(fromJson<number[]>(undefined, [1])).toEqual([1]);
    });

    it('returns fallback for empty string', () => {
      expect(fromJson<{ a: number }>('', { a: 0 })).toEqual({ a: 0 });
    });

    it('parses valid JSON', () => {
      expect(fromJson<{ a: number }>('{"a": 7}', { a: 0 })).toEqual({ a: 7 });
    });

    it('returns fallback when JSON is malformed (no throw)', () => {
      expect(fromJson<string[]>('not json', ['fallback'])).toEqual(['fallback']);
    });

    it('handles arrays', () => {
      expect(fromJson<string[]>('["a","b"]', [])).toEqual(['a', 'b']);
    });
  });

  describe('toJson', () => {
    it('serializes objects', () => {
      expect(toJson({ a: 1, b: 'x' })).toBe('{"a":1,"b":"x"}');
    });

    it('serializes arrays', () => {
      expect(toJson(['x', 'y'])).toBe('["x","y"]');
    });

    it('serializes null as "null"', () => {
      expect(toJson(null)).toBe('null');
    });

    it('serializes undefined as "null"', () => {
      expect(toJson(undefined)).toBe('null');
    });

    it('round-trips via fromJson', () => {
      const original = { name: 'Lily', interests: ['coffee', 'cats'], stage: 2 };
      const restored = fromJson(toJson(original), {});
      expect(restored).toEqual(original);
    });
  });
});
