import { describe, it, expect, vi } from 'vitest';
import { OllamaClient, OllamaError } from '@/server/llm/ollama';

describe('OllamaClient.embed', () => {
  it('returns the embedding vector', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      { ok: true, status: 200, json: async () => ({ embedding: [0.1, 0.2, 0.3] }) } as unknown as Response,
    );
    const client = new OllamaClient({ fetchImpl });
    const v = await client.embed('hello');
    expect(v).toEqual([0.1, 0.2, 0.3]);
  });

  it('throws when the response lacks an embedding', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      { ok: true, status: 200, json: async () => ({}) } as unknown as Response,
    );
    const client = new OllamaClient({ fetchImpl });
    await expect(client.embed('hello')).rejects.toBeInstanceOf(OllamaError);
  });
});
