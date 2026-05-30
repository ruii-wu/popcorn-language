import { describe, it, expect } from 'vitest';
import { OllamaClient } from '@/server/llm/ollama';
import { DEFAULT_SETTINGS } from '@/server/settings/settings';

describe('chat model default', () => {
  it('OllamaClient defaults the chat model to qwen3.5:9b when env is unset', async () => {
    const prev = process.env.OLLAMA_CHAT_MODEL;
    delete process.env.OLLAMA_CHAT_MODEL;
    try {
      const health = await new OllamaClient({ fetchImpl: async () => new Response('{}', { status: 500 }) }).health();
      expect(health.model).toBe('qwen3.5:9b');
    } finally {
      if (prev !== undefined) process.env.OLLAMA_CHAT_MODEL = prev;
    }
  });

  it('settings default modelName is qwen3.5:9b', () => {
    expect(DEFAULT_SETTINGS.modelName).toBe('qwen3.5:9b');
  });
});
