import { describe, it, expect } from 'vitest';
import { detectLang } from '@/server/text/langDetect';

describe('detectLang', () => {
  it('detects English', () => expect(detectLang('good morning')).toBe('en'));
  it('detects Chinese', () => expect(detectLang('早上好')).toBe('zh'));
  it('detects mixed', () => expect(detectLang('我想要 a latte')).toBe('mixed'));
  it('treats punctuation/numbers only as en', () => expect(detectLang('123 ...')).toBe('en'));
});
