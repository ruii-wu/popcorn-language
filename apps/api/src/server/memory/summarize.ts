// src/server/memory/summarize.ts
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';

export const SUMMARY_EVERY = 10; // summarize one window per this many messages
export const KEEP_RECENT = 4; // never summarize the live tail (kept verbatim in the recent buffer)

const SummarySchema = z.object({ summary: z.string().min(1) });

export interface SummarizeDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson' | 'embed'>;
  userId: string;
  threadId: string;
}

// Summarizes the next un-summarized window of a thread when it grows past KEEP_RECENT + SUMMARY_EVERY.
// Deterministic: the number of summaries that should exist is floor((total - KEEP_RECENT) / SUMMARY_EVERY).
export async function maybeSummarizeThread(deps: SummarizeDeps): Promise<string | null> {
  // Defense in depth: only ever summarize a thread the caller owns (every memory query is userId-scoped).
  const owned = await deps.prisma.thread.findFirst({ where: { id: deps.threadId, userId: deps.userId }, select: { id: true } });
  if (!owned) return null;

  const total = await deps.prisma.message.count({ where: { threadId: deps.threadId } });
  const due = Math.floor((total - KEEP_RECENT) / SUMMARY_EVERY);
  if (due < 1) return null;

  const existing = await deps.prisma.conversationSummary.count({ where: { threadId: deps.threadId } });
  if (existing >= due) return null;

  const start = existing * SUMMARY_EVERY;
  const windowMsgs = await deps.prisma.message.findMany({
    where: { threadId: deps.threadId },
    orderBy: { createdAt: 'asc' },
    skip: start,
    take: SUMMARY_EVERY,
  });
  if (windowMsgs.length === 0) return null;

  const transcript = windowMsgs.map((m) => `${m.userId ? 'User' : 'NPC'}: ${m.text}`).join('\n');
  const { summary } = await deps.ollama.chatJson(
    [
      { role: 'system', content: 'Summarize this conversation excerpt in 2-3 sentences, focusing on durable facts, preferences and topics. Return JSON {"summary": string}.' },
      { role: 'user', content: transcript },
    ],
    SummarySchema,
  );

  let embedding: string | null = null;
  try {
    embedding = JSON.stringify(await deps.ollama.embed(summary));
  } catch (e) {
    console.error('[memory] embed failed for summary, storing without embedding', e);
    embedding = null;
  }

  await deps.prisma.conversationSummary.create({
    data: {
      threadId: deps.threadId,
      fromMsgId: windowMsgs[0].id,
      toMsgId: windowMsgs[windowMsgs.length - 1].id,
      summary,
      embedding,
    },
  });
  return summary;
}
