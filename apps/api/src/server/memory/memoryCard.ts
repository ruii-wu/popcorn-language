// src/server/memory/memoryCard.ts
import type { Memory, PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';
import { MemoryCardSchema } from '@/server/scenario/schemas';

export interface MemoryCardDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson'>;
  userId: string;
  npcId: string;
  sessionId: string;
  transcript: string;
  grade: string;
}

// Distils one durable, human insight about the user from a finished scenario into a Memory card.
// Guarded: returns null on any failure (memory generation must never break the end flow).
export async function generateMemoryCard(deps: MemoryCardDeps): Promise<Memory | null> {
  try {
    const sourceKey = `${deps.userId}:scenario:${deps.sessionId}`;
    const card = await deps.ollama.chatJson(
      [
        {
          role: 'system',
          content:
            'You observed a roleplay between an NPC and a language learner. Distil ONE durable, human insight about the learner ' +
            'into a memory card. Return JSON {"title": short label like "Polite Disagree-er", "body": a warm 1-2 sentence observation}.',
        },
        { role: 'user', content: `Transcript:\n${deps.transcript}\n\nGrade: ${deps.grade}` },
      ],
      MemoryCardSchema,
    );
    return await deps.prisma.memory.upsert({
      where: { sourceKey },
      create: {
        userId: deps.userId,
        title: card.title,
        body: card.body,
        npcId: deps.npcId,
        sourceType: 'scenario',
        sourceRef: deps.sessionId,
        sourceKey,
      },
      // The first successfully persisted card remains authoritative across retries.
      update: {},
    });
  } catch (e) {
    console.error('[memory] generateMemoryCard failed', e);
    return null;
  }
}
