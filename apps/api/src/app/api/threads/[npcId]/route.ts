import { prisma } from '@/server/db/client';
import { withUser, json } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

export async function DELETE(req: Request, { params }: { params: { npcId: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const thread = await prisma.thread.findUnique({ where: { userId_npcId: { userId, npcId: params.npcId } } });
    if (thread) {
      await prisma.message.deleteMany({ where: { threadId: thread.id } });
      await prisma.thread.update({ where: { id: thread.id }, data: { lastMsgAt: null } });
    }
    return json({ ok: true });
  });
}
