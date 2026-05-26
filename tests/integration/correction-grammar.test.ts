// tests/integration/correction-grammar.test.ts
import { describe, it, expect, vi } from 'vitest';
import { correctGrammar } from '@/server/correction/grammar';

describe('correctGrammar', () => {
  it('returns the correction when the model flags an issue', async () => {
    const ollama = { chatJson: vi.fn().mockResolvedValue({ hasIssue: true, fixed: 'I went to the store.', noteZh: '过去式应用 went。', tag: 'tense' }) };
    const r = await correctGrammar({ ollama, userText: 'I go to the store yesterday.' });
    expect(r).toEqual({ hasIssue: true, fixed: 'I went to the store.', noteZh: '过去式应用 went。', tag: 'tense' });
  });

  it('returns null when there is no issue', async () => {
    const ollama = { chatJson: vi.fn().mockResolvedValue({ hasIssue: false, fixed: '', noteZh: '', tag: '' }) };
    expect(await correctGrammar({ ollama, userText: 'Hello, how are you?' })).toBeNull();
  });

  it('returns null (never throws) when the model call fails', async () => {
    const ollama = { chatJson: vi.fn().mockRejectedValue(new Error('LLM down')) };
    expect(await correctGrammar({ ollama, userText: 'whatever' })).toBeNull();
  });

  it('treats hasIssue:true with an empty fix as no correction', async () => {
    const ollama = { chatJson: vi.fn().mockResolvedValue({ hasIssue: true, fixed: '   ', noteZh: '', tag: '' }) };
    expect(await correctGrammar({ ollama, userText: 'ok' })).toBeNull();
  });
});
