// src/server/users/reset.ts
import type { PrismaClient } from '@prisma/client';

// Wipes a single user's content & progress while keeping their identity and preferences
// (User, UserProfile, UserSettings survive). Every delete is scoped by userId — multi-user
// isolation is the #1 invariant. Children clean up via Prisma's onDelete: Cascade:
//   relationship  → relationshipEvent
//   thread        → message, conversationSummary, scenarioSession → scenarioTurn, scenarioSummary
export async function resetUserData(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.relationship.deleteMany({ where: { userId } }),
    prisma.thread.deleteMany({ where: { userId } }),
    prisma.memory.deleteMany({ where: { userId } }),
    prisma.memoryFact.deleteMany({ where: { userId } }),
    prisma.userAchievement.deleteMany({ where: { userId } }),
    prisma.activityEvent.deleteMany({ where: { userId } }),
    prisma.memoryRetrievalLog.deleteMany({ where: { userId } }),
  ]);
}
