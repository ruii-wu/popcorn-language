// tests/unit/scenario-grade.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeGrade } from '@/server/scenario/end';

describe('normalizeGrade', () => {
  // Valid grades pass through unchanged
  it('passes through exact valid grades', () => {
    expect(normalizeGrade('A+')).toBe('A+');
    expect(normalizeGrade('A')).toBe('A');
    expect(normalizeGrade('A-')).toBe('A-');
    expect(normalizeGrade('B+')).toBe('B+');
    expect(normalizeGrade('B')).toBe('B');
    expect(normalizeGrade('B-')).toBe('B-');
    expect(normalizeGrade('C')).toBe('C');
    expect(normalizeGrade('—')).toBe('—');
  });

  // Lowercase and surrounding whitespace are normalized
  it('normalizes lowercase grades to uppercase', () => {
    expect(normalizeGrade('a+')).toBe('A+');
    expect(normalizeGrade('b-')).toBe('B-');
    expect(normalizeGrade('c')).toBe('C');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeGrade(' A+ ')).toBe('A+');
    expect(normalizeGrade('  B-  ')).toBe('B-');
  });

  it('normalizes lowercase with surrounding whitespace', () => {
    expect(normalizeGrade(' a+ ')).toBe('A+');
    expect(normalizeGrade('  b+  ')).toBe('B+');
  });

  // Internal whitespace is collapsed
  it('collapses internal whitespace', () => {
    expect(normalizeGrade('B +')).toBe('B+');
    expect(normalizeGrade('A -')).toBe('A-');
    expect(normalizeGrade('B\t+')).toBe('B+');
  });

  // Unrecognized strings starting with A/B/C fall back to the letter
  it('falls back to leading letter A for unrecognized A-prefixed strings', () => {
    expect(normalizeGrade('A-ish')).toBe('A');
    expect(normalizeGrade('APLUS')).toBe('A');
    expect(normalizeGrade('Awesome')).toBe('A');
  });

  it('falls back to leading letter B for unrecognized B-prefixed strings', () => {
    expect(normalizeGrade('Bplus')).toBe('B');
    expect(normalizeGrade('B-grade')).toBe('B');
  });

  it('falls back to leading letter C for unrecognized C-prefixed strings', () => {
    expect(normalizeGrade('Cminus')).toBe('C');
    expect(normalizeGrade('C+')).toBe('C');
  });

  // Junk with no A/B/C leading letter falls back to '—'
  it('returns em-dash for strings with no leading A/B/C letter', () => {
    expect(normalizeGrade('Z')).toBe('—');
    expect(normalizeGrade('xyz')).toBe('—');
    expect(normalizeGrade('D+')).toBe('—');
    expect(normalizeGrade('F')).toBe('—');
    expect(normalizeGrade('1A')).toBe('—');
    expect(normalizeGrade('')).toBe('—');
    expect(normalizeGrade('   ')).toBe('—');
  });
});
