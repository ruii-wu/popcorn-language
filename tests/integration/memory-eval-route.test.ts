// tests/integration/memory-eval-route.test.ts
import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST } from '@/app/api/dev/memory-eval/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w7_memeval_route__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.user.deleteMany({ where: { username: { startsWith: '__memeval__' } } });
  await prisma.$disconnect();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const post = (uid: string, body: unknown) =>
  new Request('http://x/', {
    method: 'POST',
    headers: { cookie: `${SESSION_COOKIE}=${uid}` },
    body: JSON.stringify(body),
  });

// Stub global fetch so the route's real OllamaClient.embed returns a fixed vector.
function stubEmbedFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/api/embeddings')) {
        return new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }), { status: 200 });
      }
      throw new Error(`unexpected ${u}`);
    }),
  );
}

describe('POST /api/dev/memory-eval', () => {
  it('401s without a cookie (in dev)', async () => {
    const res = await POST(new Request('http://x/', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });

  it('404s in production (the endpoint does not exist in prod), even with a cookie', async () => {
    const prev = process.env.NODE_ENV;
    // @ts-expect-error -- override readonly NODE_ENV for the test
    process.env.NODE_ENV = 'production';
    try {
      const res = await POST(post('whoever', {}));
      expect(res.status).toBe(404);
    } finally {
      // @ts-expect-error -- restore
      process.env.NODE_ENV = prev;
    }
  });

  it('returns a four-strategy comparison and writes retrieval logs for the caller', async () => {
    stubEmbedFetch();
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });

    const res = await POST(post(user.id, { k: 3 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.datasetId).toBe('default');
    expect(body.k).toBe(3);
    expect(body.perStrategy).toHaveLength(4);
    for (const s of body.perStrategy) {
      expect(typeof s.name).toBe('string');
      expect(s.recallAtK).toBeGreaterThanOrEqual(0);
      expect(s.recallAtK).toBeLessThanOrEqual(1);
    }
    expect(await prisma.memoryRetrievalLog.count({ where: { userId: user.id } })).toBe(16);
  });

  it('400s on an invalid k', async () => {
    stubEmbedFetch();
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const res = await POST(post(user.id, { k: -5 }));
    expect(res.status).toBe(400);
  });
});
