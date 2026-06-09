import { describe, it, expect } from 'vitest';
import { encodeSseEvent, sseResponse } from '@/server/sse/events';

describe('SSE', () => {
  it('encodes event + JSON data with blank-line terminator', () => {
    expect(encodeSseEvent({ event: 'token', data: { delta: 'hi' } }))
      .toBe('event: token\ndata: {"delta":"hi"}\n\n');
  });

  it('sseResponse streams encoded events and sets content-type', async () => {
    async function* gen() {
      yield { event: 'a', data: { n: 1 } };
      yield { event: 'done', data: {} };
    }
    const res = sseResponse(gen());
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('event: a\ndata: {"n":1}\n\n');
    expect(text).toContain('event: done\ndata: {}\n\n');
  });

  it('sseResponse emits an error event if the generator throws', async () => {
    async function* gen() {
      yield { event: 'a', data: {} };
      throw new Error('boom');
    }
    const text = await sseResponse(gen()).text();
    expect(text).toContain('event: error');
    expect(text).toContain('boom');
  });
});
