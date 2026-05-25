import { NextResponse } from 'next/server';
import { OllamaClient } from '@/server/llm/ollama';

export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  const ollama = await new OllamaClient().health();
  return NextResponse.json({ server: 'up', uptimeMs: Date.now() - started, ollama });
}
