import { describe, it, expect, vi } from 'vitest';
import { OllamaClient } from '@/server/llm/ollama';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe('OllamaClient.health', () => {
  it('reports reachable + modelInstalled when tags include the chat model', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'qwen2.5:7b-instruct' }, { name: 'nomic-embed-text' }] }),
    );
    const client = new OllamaClient({ chatModel: 'qwen2.5:7b-instruct', fetchImpl });
    const h = await client.health();
    expect(h.reachable).toBe(true);
    expect(h.modelInstalled).toBe(true);
    expect(h.model).toBe('qwen2.5:7b-instruct');
    expect(typeof h.latencyMs).toBe('number');
  });

  it('reports unreachable when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new OllamaClient({ fetchImpl });
    const h = await client.health();
    expect(h.reachable).toBe(false);
    expect(h.modelInstalled).toBe(false);
  });
});
