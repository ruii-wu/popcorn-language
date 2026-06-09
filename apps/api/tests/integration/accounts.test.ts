import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { registerAccount, loginAccount, UsernameTakenError } from '@/server/auth/accounts';

const prisma = new PrismaClient();
const U = '__w2_accounts_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: U } });
  await prisma.$disconnect();
});

describe('accounts', () => {
  it('registers a user with default profile + settings and logs in', async () => {
    await prisma.user.deleteMany({ where: { username: U } });
    const { userId } = await registerAccount(prisma, { username: U, password: 'pw' });
    expect(userId).toBeTruthy();

    const withRels = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true, settings: true } });
    expect(withRels?.profile).not.toBeNull();
    expect(withRels?.settings?.memoryStrategy).toBe('hybrid');

    const ok = await loginAccount(prisma, { username: U, password: 'pw' });
    expect(ok).toEqual({ userId });
  });

  it('rejects duplicate usernames', async () => {
    await expect(registerAccount(prisma, { username: U, password: 'other' })).rejects.toBeInstanceOf(UsernameTakenError);
  });

  it('returns null on wrong password', async () => {
    expect(await loginAccount(prisma, { username: U, password: 'WRONG' })).toBeNull();
  });
});
