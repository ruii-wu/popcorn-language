// src/server/memory/types.ts
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';

export type StrategyName = 'recency' | 'summary' | 'semantic' | 'hybrid';

export interface RecallQuery {
  userId: string;
  npcId?: string;
  queryText: string;
  k: number;
}

export interface RecalledItem {
  id: string;
  kind: 'fact' | 'summary';
  text: string;
  score: number;
}

export interface MemoryStrategy {
  readonly name: StrategyName;
  recall(q: RecallQuery): Promise<RecalledItem[]>;
}

export interface StrategyDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'embed'>;
}

export interface Candidate {
  id: string;
  kind: 'fact' | 'summary';
  text: string;
  embedding: number[] | null;
  createdAt: Date;
}
