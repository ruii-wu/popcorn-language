import type { PrismaClient } from '@prisma/client';

export class UsernameTakenError extends Error {
  constructor() {
    super('Username already taken');
    this.name = 'UsernameTakenError';
  }
}

export async function registerAccount(
  prisma: PrismaClient,
  input: { username: string; password: string },
): Promise<{ userId: string }> {
  const existing = await prisma.user.findUnique({ where: { username: input.username } });
  if (existing) throw new UsernameTakenError();
  const user = await prisma.user.create({
    data: {
      username: input.username,
      password: input.password, // plaintext — local demo only (spec §四)
      profile: { create: {} },
      settings: { create: {} },
    },
  });
  return { userId: user.id };
}

export async function loginAccount(
  prisma: PrismaClient,
  input: { username: string; password: string },
): Promise<{ userId: string } | null> {
  const user = await prisma.user.findFirst({
    where: { username: input.username, password: input.password },
  });
  return user ? { userId: user.id } : null;
}
