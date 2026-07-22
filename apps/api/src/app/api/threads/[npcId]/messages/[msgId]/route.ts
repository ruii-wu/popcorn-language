import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';

// Retract a user's ordinary chat message and hide the later thread history.
// Scenario turns are never directly retractable, but future open sessions are
// hidden with the same rollback and can be restored.
export async function DELETE(req: Request, { params }: { params: { npcId: string; msgId: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const message = await prisma.message.findFirst({
      where: {
        id: params.msgId,
        thread: { userId, npcId: params.npcId },
        userId,
        role: 'user',
        scenarioSessionId: null,
        hiddenAt: null,
        retractedAt: null,
      },
      select: { id: true, threadId: true, createdAt: true },
    });
    if (!message) return errorJson(404, 'NOT_FOUND', 'Message not found');

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await tx.message.update({
        where: { id: message.id },
        data: { retractedAt: now },
      });
      const hidden = await tx.message.updateMany({
        where: {
          threadId: message.threadId,
          hiddenAt: null,
          hiddenByMessageId: null,
          OR: [
            { createdAt: { gt: message.createdAt } },
            { createdAt: message.createdAt, id: { gt: message.id } },
          ],
        },
        data: { hiddenAt: now, hiddenByMessageId: message.id },
      });
      await tx.scenarioSession.updateMany({
        where: {
          threadId: message.threadId,
          invitedAt: { gte: message.createdAt },
          hiddenAt: null,
          hiddenByMessageId: null,
        },
        data: { hiddenAt: now, hiddenByMessageId: message.id },
      });
      await tx.thread.update({ where: { id: message.threadId }, data: { lastMsgAt: message.createdAt } });
      return hidden.count;
    });
    return json({ ok: true, removedAfter: result });
  });
}

export async function POST(req: Request, { params }: { params: { npcId: string; msgId: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const message = await prisma.message.findFirst({
      where: {
        id: params.msgId,
        thread: { userId, npcId: params.npcId },
        userId,
        role: 'user',
        scenarioSessionId: null,
        hiddenAt: null,
        retractedAt: { not: null },
      },
      select: { id: true, threadId: true, createdAt: true, retractedAt: true },
    });
    if (!message) return errorJson(404, 'NOT_FOUND', 'Retracted message not found');

    const restored = await prisma.$transaction(async (tx) => {
      await tx.message.update({ where: { id: message.id }, data: { retractedAt: null } });
      const visible = await tx.message.updateMany({
        where: {
          threadId: message.threadId,
          hiddenAt: { not: null },
          AND: [
            {
              OR: [
                { hiddenByMessageId: message.id },
                { hiddenByMessageId: null, hiddenAt: message.retractedAt },
              ],
            },
            {
              OR: [
                { createdAt: { gt: message.createdAt } },
                { createdAt: message.createdAt, id: { gt: message.id } },
              ],
            },
          ],
        },
        data: { hiddenAt: null, hiddenByMessageId: null },
      });
      await tx.scenarioSession.updateMany({
        where: {
          threadId: message.threadId,
          invitedAt: { gte: message.createdAt },
          hiddenAt: { not: null },
          OR: [
            { hiddenByMessageId: message.id },
            { hiddenByMessageId: null, hiddenAt: message.retractedAt },
          ],
        },
        data: { hiddenAt: null, hiddenByMessageId: null },
      });
      const last = await tx.message.findFirst({
        where: { threadId: message.threadId, hiddenAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true },
      });
      await tx.thread.update({ where: { id: message.threadId }, data: { lastMsgAt: last?.createdAt ?? null } });
      return visible.count;
    });
    return json({ ok: true, restoredAfter: restored });
  });
}
