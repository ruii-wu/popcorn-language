import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET as list } from '@/app/api/npcs/route';
import { GET as detail } from '@/app/api/npcs/[id]/route';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w2_npcs_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

const req = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('npc routes', () => {
  it('list returns all seeded NPCs with this user relationship + last message', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    await prisma.relationship.create({ data: { userId: user.id, npcId: 'lily', stage: 'friend', stageValue: 2 } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    await prisma.message.create({ data: { threadId: thread.id, userId: null, role: 'npc', text: 'last one' } });

    const data = await (await list(req(user.id))).json();
    const lily = data.find((n: { id: string }) => n.id === 'lily');
    expect(lily.relationship).toBe('friend');
    expect(lily.stageValue).toBe(2);
    expect(lily.lastMessage).toBe('last one');
    // an NPC the user has no relationship with still appears with defaults
    const emma = data.find((n: { id: string }) => n.id === 'emma');
    expect(emma.relationship).toBe('acquaintance');
    expect(emma.lastMessage).toBeNull();
  });

  it('detail returns persona panel; 404 for unknown id', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const res = await detail(req(user.id), { params: { id: 'lily' } });
    const d = await res.json();
    expect(d.name).toBe('Lily');
    expect(d.languageProfile.primary).toBe('en');
    expect(Array.isArray(d.knownFacts)).toBe(true);
    expect(d.avatar.glyph).toBe('☕');
    expect(Array.isArray(d.topicInterests)).toBe(true);
    expect('relationshipSince' in d).toBe(true);
    expect(typeof d.chatStats.conversationCount).toBe('number');
    expect((await detail(req(user.id), { params: { id: 'nope' } })).status).toBe(404);
  });

  it('list 401s without a cookie', async () => {
    expect((await list(new Request('http://x/'))).status).toBe(401);
  });
});
