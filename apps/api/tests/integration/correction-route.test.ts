// tests/integration/correction-route.test.ts
import { describe, it, expect, afterAll, vi, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SESSION_COOKIE } from '@/server/auth/session';

const prisma = new PrismaClient();
const U = '__w5_correction_route_user__';

let ollamaMock: { chatJson: ReturnType<typeof vi.fn> };
vi.mock('@/server/llm/ollama', async (orig) => {
  const actual = await orig<typeof import('@/server/llm/ollama')>();
  return { ...actual, OllamaClient: vi.fn().mockImplementation(() => ollamaMock) };
});

let POST: typeof import('@/app/api/threads/[npcId]/messages/[msgId]/correction/route').POST;
beforeAll(async () => { ({ POST } = await import('@/app/api/threads/[npcId]/messages/[msgId]/correction/route')); });
afterAll(async () => { await prisma.user.deleteMany({ where: { username: U } }); await prisma.$disconnect(); });

function reqFor(userId: string) {
  return new Request('http://t/api/threads/lily/messages/X/correction', {
    method: 'POST', headers: { cookie: `${SESSION_COOKIE}=${userId}` },
  });
}

describe('POST manual correction', () => {
  it('corrects the user message and persists it', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw' } });
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId: 'lily' } });
    const msg = await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'I go there yesterday.' } });

    ollamaMock = {
      chatJson: vi.fn().mockResolvedValue({
        hasIssue: true,
        fixed: 'I went there yesterday.',
        noteZh: '用 went。',
        tag: 'tense',
        learningSignals: [{
          skillCode: 'grammar.past_tense',
          polarity: 'mistake',
          score: 0.25,
          confidence: 0.95,
          weight: 1,
          evidence: 'go there yesterday',
        }],
      }),
    };
    const res = await POST(reqFor(user.id), { params: { npcId: 'lily', msgId: msg.id } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.correction.fixed).toBe('I went there yesterday.');
    const reloaded = await prisma.message.findUniqueOrThrow({ where: { id: msg.id } });
    expect(JSON.parse(reloaded.correction!).tag).toBe('tense');
    const signal = await prisma.learningSignal.findFirstOrThrow({ where: { sourceMessageId: msg.id } });
    expect(signal.skillCode).toBe('grammar.past_tense');
  });

  it('404s on a message that is not the caller\'s', async () => {
    const me = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const other = await prisma.user.create({ data: { username: U + '_other', password: 'pw' } });
    const oThread = await prisma.thread.create({ data: { userId: other.id, npcId: 'lily' } });
    const oMsg = await prisma.message.create({ data: { threadId: oThread.id, userId: other.id, role: 'user', text: 'hi' } });
    ollamaMock = { chatJson: vi.fn() };
    const res = await POST(reqFor(me.id), { params: { npcId: 'lily', msgId: oMsg.id } });
    expect(res.status).toBe(404);
    expect(ollamaMock.chatJson).not.toHaveBeenCalled();
    await prisma.user.delete({ where: { id: other.id } });
  });

  it('returns { correction: null } when the model finds no issue', async () => {
    const me = await prisma.user.findFirstOrThrow({ where: { username: U } });
    const thread = await prisma.thread.findFirstOrThrow({ where: { userId: me.id, npcId: 'lily' } });
    const msg = await prisma.message.create({ data: { threadId: thread.id, userId: me.id, role: 'user', text: 'Hello there.' } });
    ollamaMock = { chatJson: vi.fn().mockResolvedValue({ hasIssue: false, fixed: '', noteZh: '', tag: '' }) };
    const res = await POST(reqFor(me.id), { params: { npcId: 'lily', msgId: msg.id } });
    expect(res.status).toBe(200);
    expect((await res.json()).correction).toBeNull();
  });
});
