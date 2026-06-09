// src/app/api/memories/[id]/route.ts
import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';

export const dynamic = 'force-dynamic';

export async function DELETE(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  return withUser(req, async (userId) => {
    const mem = await prisma.memory.findFirst({ where: { id: params.id, userId } });
    if (!mem) return errorJson(404, 'NOT_FOUND', 'No such memory');
    await prisma.memory.delete({ where: { id: mem.id } });
    return json({ ok: true });
  });
}
