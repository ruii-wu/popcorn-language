import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { OllamaClient, OllamaError } from '@/server/llm/ollama';

function chatJsonResponse(content: string): Response {
  return { ok: true, status: 200, json: async () => ({ message: { content } }) } as unknown as Response;
}

const schema = z.object({ fixed: z.string(), tag: z.string() });

describe('OllamaClient.chatJson', () => {
  it('retries past invalid JSON then returns a validated object', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(chatJsonResponse('not json'))
      .mockResolvedValueOnce(chatJsonResponse(JSON.stringify({ fixed: 'I am going', tag: 'Grammar' })));
    const client = new OllamaClient({ fetchImpl });
    const out = await client.chatJson([{ role: 'user', content: 'x' }], schema, { maxRetries: 3 });
    expect(out).toEqual({ fixed: 'I am going', tag: 'Grammar' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string);
    expect(body.think).toBe(false);
    expect(body.keep_alive).toBe(-1);
  });

  it('throws OllamaError after exhausting retries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(chatJsonResponse('still not json'));
    const client = new OllamaClient({ fetchImpl });
    await expect(client.chatJson([{ role: 'user', content: 'x' }], schema, { maxRetries: 3 }))
      .rejects.toBeInstanceOf(OllamaError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
