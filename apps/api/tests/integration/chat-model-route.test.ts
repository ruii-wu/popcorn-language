import { describe, it, expect, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__chat_model_route_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
  vi.doUnmock('@/server/llm/ollama');
});

const post = (uid: string, obj: unknown) =>
  new Request('http://x/', {
    method: 'POST',
    headers: { cookie: `${SESSION_COOKIE}=${uid}` },
    body: JSON.stringify(obj),
  });

describe('chat route model settings', () => {
  it('constructs the Ollama client with the caller settings modelName', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({
      data: {
        username: U,
        password: 'pw',
        settings: { create: { modelName: 'llama3.1:8b' } },
      },
    });

    const seen: unknown[] = [];
    vi.resetModules();
    vi.doMock('@/server/llm/ollama', () => ({
      OllamaClient: class {
        constructor(opts?: unknown) { seen.push(opts ?? {}); }
        async *chat() { throw new Error('stop'); }
        async chatJson() { return { facts: [] }; }
        async embed() { return []; }
      },
    }));

    const { POST } = await import('@/app/api/threads/[npcId]/messages/route');
    const res = await POST(post(user.id, { text: 'hello' }), { params: { npcId: 'lily' } });
    await res.text();

    expect(seen[0]).toMatchObject({ chatModel: 'llama3.1:8b' });
  });
});
