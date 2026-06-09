import { json } from '@/server/http/respond';
import { OllamaClient } from '@/server/llm/ollama';

export async function GET(): Promise<Response> {
  const started = Date.now();
  const ollama = await new OllamaClient().health();
  return json({ server: 'up', uptimeMs: Date.now() - started, ollama });
}
