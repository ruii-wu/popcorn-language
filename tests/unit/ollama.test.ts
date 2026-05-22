import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  chat,
  chatJson,
  chatStream,
  ollamaHealth,
  OllamaError,
  PRESETS,
} from '@/lib/llm/ollama';

// ----------------------------------------------------------------------------
// Helpers to build a fake streaming Response from a list of NDJSON lines.
// Optional chunkBoundaries can split lines across reads to verify the parser
// handles incomplete fragments.
// ----------------------------------------------------------------------------

function ndjsonStream(lines: string[], opts?: { splitInMiddle?: boolean }): Response {
  const enc = new TextEncoder();
  const joined = lines.join('\n') + '\n';
  const chunks: Uint8Array[] = [];
  if (opts?.splitInMiddle && joined.length > 6) {
    const mid = Math.floor(joined.length / 2);
    chunks.push(enc.encode(joined.slice(0, mid)));
    chunks.push(enc.encode(joined.slice(mid)));
  } else {
    chunks.push(enc.encode(joined));
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  // @ts-expect-error overriding global fetch for tests
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => impl(url, init));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  // @ts-expect-error reset
  global.fetch = undefined;
});

// ----------------------------------------------------------------------------
// Health
// ----------------------------------------------------------------------------

describe('ollamaHealth', () => {
  it('reports reachable=false when fetch throws', async () => {
    mockFetch(() => { throw new Error('ECONNREFUSED'); });
    const h = await ollamaHealth();
    expect(h.reachable).toBe(false);
    expect(h.error).toContain('ECONNREFUSED');
    expect(h.modelLoaded).toBe(false);
  });

  it('reports reachable=false when HTTP non-2xx', async () => {
    mockFetch(() => new Response('nope', { status: 500 }));
    const h = await ollamaHealth();
    expect(h.reachable).toBe(false);
    expect(h.error).toBe('HTTP 500');
  });

  it('reports reachable=true and lists models when /api/tags returns them', async () => {
    mockFetch((url) => {
      expect(url).toContain('/api/tags');
      return jsonResponse({ models: [{ name: 'qwen2.5:7b-instruct' }, { name: 'llama3:8b' }] });
    });
    const h = await ollamaHealth();
    expect(h.reachable).toBe(true);
    expect(h.availableModels).toEqual(['qwen2.5:7b-instruct', 'llama3:8b']);
    expect(h.modelLoaded).toBe(true);
  });

  it('sets modelLoaded=false when the configured model is not in the list', async () => {
    mockFetch(() => jsonResponse({ models: [{ name: 'llama3:8b' }] }));
    const h = await ollamaHealth();
    expect(h.reachable).toBe(true);
    expect(h.modelLoaded).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// chatStream — streaming
// ----------------------------------------------------------------------------

describe('chatStream', () => {
  it('yields content deltas in order from NDJSON chunks', async () => {
    const lines = [
      JSON.stringify({ model: 'qwen2.5:7b', message: { role: 'assistant', content: 'hello' }, done: false }),
      JSON.stringify({ model: 'qwen2.5:7b', message: { role: 'assistant', content: ' world' }, done: false }),
      JSON.stringify({ model: 'qwen2.5:7b', message: { role: 'assistant', content: '!' }, done: false }),
      JSON.stringify({ model: 'qwen2.5:7b', done: true, total_duration: 2_000_000, eval_count: 17 }),
    ];
    mockFetch(() => ndjsonStream(lines));

    const tokens: string[] = [];
    const it = chatStream([{ role: 'user', content: 'hi' }], { preset: 'casual' });
    let final;
    while (true) {
      const { value, done } = await it.next();
      if (done) { final = value; break; }
      tokens.push(value);
    }
    expect(tokens).toEqual(['hello', ' world', '!']);
    expect(final).toMatchObject({
      text: 'hello world!',
      model: 'qwen2.5:7b',
      tokensUsed: 17,
      totalDurationMs: 2,
    });
  });

  it('correctly handles a line split across two reads', async () => {
    const lines = [
      JSON.stringify({ message: { content: 'foo' }, done: false }),
      JSON.stringify({ message: { content: 'bar' }, done: false }),
      JSON.stringify({ done: true, eval_count: 5 }),
    ];
    mockFetch(() => ndjsonStream(lines, { splitInMiddle: true }));

    const tokens: string[] = [];
    for await (const t of chatStream([{ role: 'user', content: 'go' }])) {
      tokens.push(t);
    }
    expect(tokens.join('')).toBe('foobar');
  });

  it('ignores empty lines and unparseable lines without yielding garbage', async () => {
    const lines = [
      '',
      '   ',
      JSON.stringify({ message: { content: 'a' }, done: false }),
      '{ not json',
      JSON.stringify({ message: { content: 'b' }, done: false }),
      JSON.stringify({ done: true }),
    ];
    mockFetch(() => ndjsonStream(lines));
    const tokens: string[] = [];
    for await (const t of chatStream([{ role: 'user', content: '' }])) tokens.push(t);
    expect(tokens).toEqual(['a', 'b']);
  });

  it('throws OllamaError(NETWORK) when fetch throws', async () => {
    mockFetch(() => { throw new Error('boom'); });
    const it = chatStream([{ role: 'user', content: 'x' }]);
    await expect(it.next()).rejects.toMatchObject({
      name: 'OllamaError',
      kind: 'NETWORK',
    });
  });

  it('throws OllamaError(HTTP) when response is non-2xx', async () => {
    mockFetch(() => new Response('bad', { status: 503, statusText: 'Service Unavailable' }));
    const it = chatStream([{ role: 'user', content: 'x' }]);
    await expect(it.next()).rejects.toMatchObject({
      name: 'OllamaError',
      kind: 'HTTP',
    });
  });

  it('sends correct request body with preset options applied', async () => {
    let captured: { url?: string; body?: unknown } = {};
    mockFetch((url, init) => {
      captured.url = url;
      captured.body = init?.body ? JSON.parse(String(init.body)) : undefined;
      return ndjsonStream([JSON.stringify({ done: true })]);
    });
    for await (const _ of chatStream(
      [{ role: 'user', content: 'hi' }],
      { preset: 'scenario', numCtx: 4096 },
    )) { /* drain */ }

    expect(captured.url).toContain('/api/chat');
    expect((captured.body as any).stream).toBe(true);
    expect((captured.body as any).options.temperature).toBe(PRESETS.scenario.temperature);
    expect((captured.body as any).options.num_ctx).toBe(4096);
  });
});

// ----------------------------------------------------------------------------
// chat (non-streaming wrapper)
// ----------------------------------------------------------------------------

describe('chat', () => {
  it('collects full text from a stream', async () => {
    const lines = [
      JSON.stringify({ message: { content: 'one ' } }),
      JSON.stringify({ message: { content: 'two ' } }),
      JSON.stringify({ message: { content: 'three' } }),
      JSON.stringify({ done: true, eval_count: 3 }),
    ];
    mockFetch(() => ndjsonStream(lines));
    const r = await chat([{ role: 'user', content: 'count' }]);
    expect(r.text).toBe('one two three');
    expect(r.tokensUsed).toBe(3);
  });
});

// ----------------------------------------------------------------------------
// chatJson — JSON-with-retry
// ----------------------------------------------------------------------------

describe('chatJson', () => {
  const schema = z.object({ verdict: z.string(), score: z.number() });

  it('parses valid JSON returned by Ollama (format=json path)', async () => {
    mockFetch(() => jsonResponse({
      model: 'qwen2.5:7b',
      message: { content: '{"verdict":"ok","score":7}' },
      eval_count: 12,
    }));
    const r = await chatJson(
      [{ role: 'user', content: 'judge' }],
      { schema },
    );
    expect(r.data).toEqual({ verdict: 'ok', score: 7 });
    expect(r.attempts).toBe(1);
    expect(r.usedFallback).toBe(false);
  });

  it('strips ```json``` fences before parsing', async () => {
    mockFetch(() => jsonResponse({
      message: { content: '```json\n{"verdict":"ok","score":1}\n```' },
    }));
    const r = await chatJson(
      [{ role: 'user', content: 'judge' }],
      { schema },
    );
    expect(r.data).toEqual({ verdict: 'ok', score: 1 });
  });

  it('retries when JSON is invalid, then succeeds', async () => {
    let calls = 0;
    mockFetch(() => {
      calls++;
      if (calls === 1) return jsonResponse({ message: { content: 'not json at all' } });
      return jsonResponse({ message: { content: '{"verdict":"ok","score":3}' } });
    });
    const r = await chatJson(
      [{ role: 'user', content: 'judge' }],
      { schema },
    );
    expect(calls).toBe(2);
    expect(r.attempts).toBe(2);
    expect(r.data.score).toBe(3);
  });

  it('retries on schema mismatch, then succeeds', async () => {
    let calls = 0;
    mockFetch(() => {
      calls++;
      if (calls < 2) return jsonResponse({ message: { content: '{"verdict":"ok"}' } }); // missing score
      return jsonResponse({ message: { content: '{"verdict":"ok","score":9}' } });
    });
    const r = await chatJson([{ role: 'user', content: 'judge' }], { schema });
    expect(r.attempts).toBe(2);
    expect(r.data.score).toBe(9);
  });

  it('falls back after max retries when fallback is provided', async () => {
    mockFetch(() => jsonResponse({ message: { content: 'garbage' } }));
    const r = await chatJson(
      [{ role: 'user', content: 'judge' }],
      { schema, maxRetries: 2, fallback: { verdict: 'fallback', score: 0 } },
    );
    expect(r.usedFallback).toBe(true);
    expect(r.attempts).toBe(2);
    expect(r.data).toEqual({ verdict: 'fallback', score: 0 });
  });

  it('throws OllamaError after max retries when no fallback', async () => {
    mockFetch(() => jsonResponse({ message: { content: 'garbage' } }));
    await expect(
      chatJson([{ role: 'user', content: 'judge' }], { schema, maxRetries: 2 }),
    ).rejects.toThrow(/OllamaError/);
  });

  it('treats HTTP 500 as a recoverable error and retries', async () => {
    let calls = 0;
    mockFetch(() => {
      calls++;
      if (calls === 1) return new Response('fail', { status: 500, statusText: 'Internal' });
      return jsonResponse({ message: { content: '{"verdict":"ok","score":1}' } });
    });
    const r = await chatJson(
      [{ role: 'user', content: 'judge' }],
      { schema, maxRetries: 3 },
    );
    expect(calls).toBe(2);
    expect(r.data.score).toBe(1);
  });

  it('appends a nudge message on retries', async () => {
    const sent: any[][] = [];
    mockFetch((_url, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      sent.push(body.messages);
      return jsonResponse({ message: { content: 'still bad' } });
    });
    await expect(
      chatJson([{ role: 'user', content: 'judge' }], { schema, maxRetries: 2 }),
    ).rejects.toThrow();
    expect(sent[0]).toHaveLength(1);
    expect(sent[1]).toHaveLength(2);
    expect(sent[1][1].content).toMatch(/not valid JSON/i);
  });

  it('sends format:"json" in the request body', async () => {
    let captured: any;
    mockFetch((_url, init) => {
      captured = init?.body ? JSON.parse(String(init.body)) : {};
      return jsonResponse({ message: { content: '{"verdict":"ok","score":1}' } });
    });
    await chatJson([{ role: 'user', content: 'x' }], { schema });
    expect(captured.format).toBe('json');
    expect(captured.stream).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// OllamaError
// ----------------------------------------------------------------------------

describe('OllamaError', () => {
  it('carries the kind and formats the message', () => {
    const e = new OllamaError('NETWORK', 'connection refused');
    expect(e.kind).toBe('NETWORK');
    expect(e.message).toContain('[OllamaError:NETWORK]');
    expect(e.message).toContain('connection refused');
    expect(e.name).toBe('OllamaError');
  });
});
