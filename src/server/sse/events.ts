export interface SseEvent {
  event: string;
  data: unknown;
}

export function encodeSseEvent(e: SseEvent): string {
  return `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
}

export function sseResponse(gen: AsyncIterable<SseEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const e of gen) controller.enqueue(encoder.encode(encodeSseEvent(e)));
      } catch (err) {
        controller.enqueue(
          encoder.encode(encodeSseEvent({ event: 'error', data: { code: 'STREAM_ERROR', message: String(err) } })),
        );
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
