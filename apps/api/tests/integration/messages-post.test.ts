import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { POST } from '@/app/api/threads/[npcId]/messages/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w2_msgpost_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const post = (uid: string | null, obj: unknown) =>
  new Request('http://x/', {
    method: 'POST',
    headers: uid ? { cookie: `${SESSION_COOKIE}=${uid}` } : {},
    body: JSON.stringify(obj),
  });

describe('POST messages (SSE)', () => {
  it('401s without a cookie', async () => {
    expect((await POST(post(null, { text: 'hi' }), { params: { npcId: 'lily' } })).status).toBe(401);
  });

  it('400s on empty text', async () => {
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    expect((await POST(post(user.id, { text: '' }), { params: { npcId: 'lily' } })).status).toBe(400);
  });

  it('returns an SSE stream that begins by saving the user message', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const res = await POST(post(user.id, { text: 'hello lily' }), { params: { npcId: 'lily' } });
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const text = await res.text(); // Ollama down in tests → still saves user msg, then error + done
    expect(text).toContain('event: user_message_saved');
    expect(text).toContain('event: done');
    const saved = await prisma.message.count({ where: { thread: { userId: user.id, npcId: 'lily' }, role: 'user' } });
    expect(saved).toBe(1);
  });
});
