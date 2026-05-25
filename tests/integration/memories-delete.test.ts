// tests/integration/memories-delete.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DELETE } from '@/app/api/memories/[id]/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w3_memdel_user__';
const OTHER = '__w3_memdel_other__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { in: [U, OTHER] } } });
  await prisma.$disconnect();
});

const del = (uid: string) => new Request('http://x/', { method: 'DELETE', headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('DELETE /api/memories/:id', () => {
  it('deletes the caller own memory and 404s for another user memory', async () => {
    await prisma.user.deleteMany({ where: { username: { in: [U, OTHER] } } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const other = await prisma.user.create({ data: { username: OTHER, password: 'pw' } });
    const mine = await prisma.memory.create({ data: { userId: user.id, title: 'mine', body: 'b', sourceType: 'chat_pattern' } });
    const theirs = await prisma.memory.create({ data: { userId: other.id, title: 'theirs', body: 'b', sourceType: 'chat_pattern' } });

    // cannot delete another user's memory — scoped lookup returns 404, row survives
    expect((await DELETE(del(user.id), { params: { id: theirs.id } })).status).toBe(404);
    expect(await prisma.memory.count({ where: { id: theirs.id } })).toBe(1);

    // own memory deletes
    const ok = await (await DELETE(del(user.id), { params: { id: mine.id } })).json();
    expect(ok.ok).toBe(true);
    expect(await prisma.memory.count({ where: { id: mine.id } })).toBe(0);
  });
});
