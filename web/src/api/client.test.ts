import { describe, it, expect } from 'vitest';
import { parseFrame } from './client';

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
});
