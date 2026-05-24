import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const USERNAME = '__w1_schema_test_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: USERNAME } });
  await prisma.$disconnect();
});

describe('schema', () => {
  it('creates a user with a profile and reads it back', async () => {
    await prisma.user.deleteMany({ where: { username: USERNAME } });
    const user = await prisma.user.create({
      data: {
        username: USERNAME,
        password: 'plain',
        profile: { create: { role: 'Student', goal: 'work', interests: JSON.stringify(['Coffee']) } },
      },
      include: { profile: true },
    });
    expect(user.username).toBe(USERNAME);
    expect(user.language).toBe('zh-CN');
    expect(user.profile?.role).toBe('Student');
    expect(JSON.parse(user.profile!.interests)).toEqual(['Coffee']);
  });
});
