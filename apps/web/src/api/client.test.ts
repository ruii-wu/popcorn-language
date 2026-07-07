import { describe, it, expect, vi, afterEach } from 'vitest';
import { api, parseFrame } from './client';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseFrame', () => {
  it('parses an event line + JSON data line', () => {
    expect(parseFrame('event: token\ndata: {"text":"hi"}')).toEqual({
      type: 'token',
      data: { text: 'hi' },
    });
  });

  it('defaults type to "message" and keeps a raw string when data is not JSON', () => {
    expect(parseFrame('data: hello')).toEqual({ type: 'message', data: 'hello' });
  });

  it('joins multiple data lines with newlines', () => {
    expect(parseFrame('event: x\ndata: a\ndata: b')).toEqual({ type: 'x', data: 'a\nb' });
  });

  it('returns null data for a frame with no data line', () => {
    expect(parseFrame('event: ping')).toEqual({ type: 'ping', data: null });
  });

  it('emits done after a network error so callers can reset pending UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const events: string[] = [];

    await api.streamMessage('lily', 'hello', (event) => {
      events.push(event.type);
    });

    expect(events).toEqual(['error', 'done']);
  });
});
