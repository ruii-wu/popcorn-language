import { prisma } from '@/server/db/client';
import { withUser, json, errorJson } from '@/server/http/respond';
import { OllamaClient } from '@/server/llm/ollama';
import { correctGrammar } from '@/server/correction/grammar';

export async function POST(
  req: Request,
  { params }: { params: { npcId: string; msgId: string } },
): Promise<Response> {
  return withUser(req, async (userId) => {
    // user-scoped: a foreign message id must not be correctable. User messages carry userId;
    // restricting to userId also rules out correcting an NPC line (those have userId = null).
    const msg = await prisma.message.findFirst({
      where: { id: params.msgId, userId, thread: { npcId: params.npcId } },
    });
    if (!msg) return errorJson(404, 'NOT_FOUND', 'Message not found');

    const correction = await correctGrammar({ ollama: new OllamaClient(), userText: msg.text });
    if (!correction) return json({ correction: null });

    const payload = { fixed: correction.fixed, noteZh: correction.noteZh, tag: correction.tag };
    await prisma.message.update({ where: { id: msg.id }, data: { correction: JSON.stringify(payload) } });
    return json({ correction: payload });
  });
}
