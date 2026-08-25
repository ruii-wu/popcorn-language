// tests/integration/correction-grammar.test.ts
import { describe, it, expect, vi } from 'vitest';
import { correctGrammar } from '@/server/correction/grammar';

describe('correctGrammar', () => {
  it('returns the correction when the model flags an issue', async () => {
    const ollama = { chatJson: vi.fn().mockResolvedValue({ hasIssue: true, fixed: 'I went to the store.', noteZh: '过去式应用 went。', tag: 'tense', learningSignals: [] }) };
    const r = await correctGrammar({ ollama, userText: 'I go to the store yesterday.' });
    expect(r).toEqual({ hasIssue: true, fixed: 'I went to the store.', noteZh: '过去式应用 went。', tag: 'tense', signals: [] });
  });

  it('returns null when there is no issue', async () => {
    const ollama = { chatJson: vi.fn().mockResolvedValue({ hasIssue: false, fixed: '', noteZh: '', tag: '', learningSignals: [] }) };
    expect(await correctGrammar({ ollama, userText: 'Hello, how are you?' })).toBeNull();
  });

  it('returns null (never throws) when the model call fails', async () => {
    const ollama = { chatJson: vi.fn().mockRejectedValue(new Error('LLM down')) };
    expect(await correctGrammar({ ollama, userText: 'whatever' })).toBeNull();
  });

  it('treats hasIssue:true with an empty fix as no correction', async () => {
    const ollama = { chatJson: vi.fn().mockResolvedValue({ hasIssue: true, fixed: '   ', noteZh: '', tag: '', learningSignals: [] }) };
    expect(await correctGrammar({ ollama, userText: 'ok' })).toBeNull();
  });

  it('extracts learning signals for known skill codes with forced mistake polarity', async () => {
    const ollama = { chatJson: vi.fn().mockResolvedValue({
      hasIssue: true, fixed: 'I went yesterday.', noteZh: '过去式', tag: 'tense',
      learningSignals: [
        { skillCode: 'grammar.past_tense', polarity: 'mistake', score: 0.3, confidence: 0.9, weight: 1, evidence: 'I go yesterday' },
      ],
    }) };
    const r = await correctGrammar({ ollama, userText: 'I go yesterday' });
    expect(r?.signals).toHaveLength(1);
    expect(r?.signals[0].skillCode).toBe('grammar.past_tense');
    expect(r?.signals[0].polarity).toBe('mistake');
  });

  it('drops signals with unknown skill codes', async () => {
    const ollama = { chatJson: vi.fn().mockResolvedValue({
      hasIssue: true, fixed: 'fixed', noteZh: '', tag: '',
      learningSignals: [
        { skillCode: 'grammar.made_up', polarity: 'mistake', score: 0.3, confidence: 0.9, weight: 1 },
        { skillCode: 'grammar.past_tense', polarity: 'mistake', score: 0.3, confidence: 0.9, weight: 1 },
      ],
    }) };
    const r = await correctGrammar({ ollama, userText: 'x' });
    expect(r?.signals.map((s) => s.skillCode)).toEqual(['grammar.past_tense']);
  });

  it('forces polarity to mistake even if the model returns success (defensive)', async () => {
    const ollama = { chatJson: vi.fn().mockResolvedValue({
      hasIssue: true, fixed: 'fixed', noteZh: '', tag: '',
      learningSignals: [
        { skillCode: 'grammar.past_tense', polarity: 'success', score: 0.9, confidence: 0.9, weight: 1 },
      ],
    }) };
    const r = await correctGrammar({ ollama, userText: 'x' });
    expect(r?.signals[0].polarity).toBe('mistake');
  });

  it('keeps a valid correction when an auxiliary signal is malformed', async () => {
    const ollama = { chatJson: vi.fn().mockResolvedValue({
      hasIssue: true, fixed: 'I went yesterday.', noteZh: '过去式', tag: 'tense',
      learningSignals: [
        { skillCode: 'grammar.past_tense', polarity: 'mistake', score: 'bad', confidence: 0.9, weight: 1 },
      ],
    }) };
    const r = await correctGrammar({ ollama, userText: 'I go yesterday.' });
    expect(r?.fixed).toBe('I went yesterday.');
    expect(r?.signals).toEqual([]);
  });
});
