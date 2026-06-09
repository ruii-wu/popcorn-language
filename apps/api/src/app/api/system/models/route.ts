// src/app/api/system/models/route.ts
import { OllamaClient } from '@/server/llm/ollama';
import { withUser, json } from '@/server/http/respond';

export async function GET(req: Request): Promise<Response> {
  return withUser(req, async () => {
    const models = await new OllamaClient().listModels();
    return json(models);
  });
}
