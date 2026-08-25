import type { Prisma } from '@prisma/client';

// User-facing progress follows the same visibility rules as the chat timeline.
// ActivityEvent remains an audit log and is intentionally not used for rollback-aware totals.
export function visibleUserMessageWhere(userId: string): Prisma.MessageWhereInput {
  return {
    userId,
    role: 'user',
    hiddenAt: null,
    retractedAt: null,
  };
}
