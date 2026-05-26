export async function* runScenarioEnd(_deps: unknown): AsyncGenerator<import('@/server/sse/events').SseEvent> {
  yield { event: 'scenario_end', data: {} };
}
