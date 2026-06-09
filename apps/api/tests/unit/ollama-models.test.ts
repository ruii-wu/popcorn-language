// tests/unit/ollama-models.test.ts
import { describe, it, expect } from 'vitest';
import { OllamaClient } from '@/server/llm/ollama';

function fakeFetch(handlers: Record<string, () => Response>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/api/tags')) return handlers.tags();
    if (u.includes('/api/ps')) return handlers.ps();
    throw new Error(`unexpected url ${u}`);
  }) as unknown as typeof fetch;
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('OllamaClient.listModels', () => {
  it('maps installed models to {name,sizeGB,loaded}, flagging loaded ones from /api/ps', async () => {
    const client = new OllamaClient({
      fetchImpl: fakeFetch({
        tags: () => ok({ models: [{ name: 'qwen2.5:7b-instruct', size: 4_700_000_000 }, { name: 'nomic-embed-text', size: 270_000_000 }] }),
        ps: () => ok({ models: [{ name: 'qwen2.5:7b-instruct' }] }),
      }),
    });
    const models = await client.listModels();
    expect(models).toEqual([
      { name: 'qwen2.5:7b-instruct', sizeGB: 4.7, loaded: true },
      { name: 'nomic-embed-text', sizeGB: 0.3, loaded: false },
    ]);
  });

  it('returns [] when /api/tags is unreachable (never throws)', async () => {
    const client = new OllamaClient({
      fetchImpl: (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch,
    });
    expect(await client.listModels()).toEqual([]);
  });

  it('degrades loaded=false when /api/ps fails but /api/tags works', async () => {
    const client = new OllamaClient({
      fetchImpl: fakeFetch({
        tags: () => ok({ models: [{ name: 'qwen2.5:7b-instruct', size: 4_700_000_000 }] }),
        ps: () => { throw new Error('ps down'); },
      }),
    });
    expect(await client.listModels()).toEqual([{ name: 'qwen2.5:7b-instruct', sizeGB: 4.7, loaded: false }]);
  });
});
