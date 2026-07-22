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

  it('passes an abort signal to chat fetch and suppresses error frames after cancellation', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const events: string[] = [];

    const request = api.streamMessage('lily', 'hello', (event) => events.push(event.type), controller.signal);
    controller.abort();
    await request;

    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    expect(events).toEqual([]);
  });

  it('treats a streamed error frame as terminal', async () => {
    const stream = [
      'event: error\ndata: {"code":"FAILED"}',
      'event: token\ndata: {"delta":"should not render"}',
      'event: done\ndata: {}',
    ].join('\n\n') + '\n\n';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));
    const events: string[] = [];

    await api.streamMessage('lily', 'hello', (event) => events.push(event.type));

    expect(events).toEqual(['error']);
  });

  it('requires an explicit confirmation payload when resetting user data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.resetUserData();

    expect(fetchMock).toHaveBeenCalledWith('/api/system/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
  });

  it('calls the persisted scenario pause and resume endpoints', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.pauseSession('session-1');
    await api.resumeSession('session-1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/scenarios/sessions/session-1/pause', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/scenarios/sessions/session-1/resume', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
  });
});
