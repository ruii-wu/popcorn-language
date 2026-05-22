import { NextResponse } from 'next/server';
import { ollamaHealth } from '@/lib/llm/ollama';

export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  const ollama = await ollamaHealth();
  return NextResponse.json({
    server: 'up',
    uptimeMs: Date.now() - started,
    ollama,
  });
}
