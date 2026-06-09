import { describe, it, expect, vi } from 'vitest';
import { OllamaClient } from '@/server/llm/ollama';

function ndjsonResponse(lines: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(l + '\n'));
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe('OllamaClient.chat', () => {
  it('yields content tokens until done', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ndjsonResponse([
        JSON.stringify({ message: { content: 'hel' }, done: false }),
        JSON.stringify({ message: { content: 'lo' }, done: false }),
        JSON.stringify({ message: { content: '!' }, done: true }),
      ]),
    );
    const client = new OllamaClient({ fetchImpl });
    const out: string[] = [];
    for await (const tok of client.chat([{ role: 'user', content: 'hi' }])) out.push(tok);
    expect(out.join('')).toBe('hello!');
  });
});
