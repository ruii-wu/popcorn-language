import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET } from '@/app/api/learner-model/route';
import { SESSION_COOKIE } from '@/server/auth/session';
import { writeSignals } from '@/server/learning/signals';

const prisma = new PrismaClient();
const U = '__p2_learner_route__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: U } } });
  await prisma.$disconnect();
});

const get = (uid: string) => new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=${uid}` } });

describe('GET /api/learner-model', () => {
  it('401s without a session cookie', async () => {
    const res = await GET(new Request('http://x/'));
    expect(res.status).toBe(401);
  });

  it('returns 30 skills bootstrapped from CEFR and an empty focus when no signals exist', async () => {
    await prisma.user.deleteMany({ where: { username: { startsWith: U } } });
    const user = await prisma.user.create({ data: { username: U, password: 'pw', cefrLevel: 'B1' } });
    const res = await GET(get(user.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skills).toHaveLength(30);
    expect(body.focus).toEqual([]);
    const pt = body.skills.find((s: any) => s.skillCode === 'grammar.past_tense');
    expect(pt.status).toBe('gathering');
    expect(pt.evidenceN).toBe(0);
    // level 6-digit rounded per route serializer
    expect(typeof pt.level).toBe('number');
  });

  it('exposes focus items after enough mistake signals accumulate', async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { username: U } });
    for (let i = 0; i < 3; i++) {
      await writeSignals({
        prisma, userId: user.id,
        sourceType: 'scenario_summary', sourceRef: `focus_${i}`,
        signals: [{ skillCode: 'pragmatics.polite_disagreement', polarity: 'mistake', score: 0.0, confidence: 0.9, weight: 1 }],
      });
    }
    const res = await GET(get(user.id));
    const body = await res.json();
    expect(body.focus.length).toBeGreaterThanOrEqual(1);
    expect(body.focus.some((s: any) => s.skillCode === 'pragmatics.polite_disagreement')).toBe(true);
  });
});
