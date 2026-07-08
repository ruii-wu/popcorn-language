// src/server/memory/factExtract.ts
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient, ChatMessage } from '@/server/llm/ollama';

const FactSchema = z.object({
  subject: z.string().default('user'),
  predicate: z.string().min(1),
  value: z.string().min(1),
  confidence: z.number().min(0).max(1).default(0.7),
});
export const FactsSchema = z.object({ facts: z.array(FactSchema) });

const SYSTEM_PROMPT =
  'You extract durable personal facts about the user from their chat message. ' +
  'Return JSON {"facts": [{"subject":"user","predicate":<snake_case>,"value":<short string>,"confidence":<0..1>}]}. ' +
  'Use predicates like has_pet, works_as, lives_near, studies_for, likes, dislikes, goal. ' +
  'Only include stable, personal facts worth remembering long-term. ' +
  'If the message contains none, return {"facts": []}. No prose outside the JSON.';

export interface FactExtractDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson' | 'embed'>;
  userId: string;
  text: string;
  sourceMsgId?: string;
  context?: string;
  npcId?: string;
}

// Extracts facts from the user's message and stores new ones (dedup by predicate+value). Returns count stored.
export async function extractAndStoreFacts(deps: FactExtractDeps): Promise<number> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: (deps.context ? `Earlier context:\n${deps.context}\n\n` : '') + `Message:\n${deps.text}` },
  ];
  const out = await deps.ollama.chatJson(messages, FactsSchema);

  let stored = 0;
  for (const f of out.facts) {
    const existing = await deps.prisma.memoryFact.findFirst({
      where: { userId: deps.userId, predicate: f.predicate, value: f.value },
    });
    if (existing) {
      if (deps.npcId) {
        let known: string[];
        try {
          const parsed = JSON.parse(existing.knownToNpcs);
          known = Array.isArray(parsed) ? parsed : [];
        } catch {
          known = [];
        }
        if (!known.includes(deps.npcId)) {
          await deps.prisma.memoryFact.update({
            where: { id: existing.id },
            data: { knownToNpcs: JSON.stringify([...known, deps.npcId]) },
          });
        }
      }
      continue;
    }

    let embedding: string | null = null;
    try {
      embedding = JSON.stringify(await deps.ollama.embed(f.value));
    } catch (e) {
      console.error('[memory] embed failed for fact, storing without embedding', e);
      embedding = null;
    }

    await deps.prisma.memoryFact.create({
      data: {
        userId: deps.userId,
        subject: f.subject,
        predicate: f.predicate,
        value: f.value,
        confidence: f.confidence,
        embedding,
        sourceMsgId: deps.sourceMsgId ?? null,
        knownToNpcs: deps.npcId ? JSON.stringify([deps.npcId]) : '[]',
      },
    });
    stored++;
  }
  return stored;
}
