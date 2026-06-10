// src/server/memory/postTurn.ts
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';
import { extractAndStoreFacts } from './factExtract';
import { maybeSummarizeThread } from './summarize';

export interface PostTurnDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson' | 'embed'>;
  userId: string;
  threadId: string;
  userText: string;
  userMsgId: string;
  npcId?: string;
}

// Runs after the NPC reply: extract new facts from the user's turn + maybe summarize the thread.
// Each step is independently guarded — memory work must never break the chat response.
export async function runPostTurnMemory(deps: PostTurnDeps): Promise<void> {
  try {
    await extractAndStoreFacts({
      prisma: deps.prisma,
      ollama: deps.ollama,
      userId: deps.userId,
      text: deps.userText,
      sourceMsgId: deps.userMsgId,
      npcId: deps.npcId,
    });
  } catch (e) {
    console.error('[memory] factExtract failed', e);
  }

  try {
    await maybeSummarizeThread({ prisma: deps.prisma, ollama: deps.ollama, userId: deps.userId, threadId: deps.threadId });
  } catch (e) {
    console.error('[memory] summarize failed', e);
  }
}
