// src/server/memory/eval/harness.ts
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';
import type { StrategyName } from '@/server/memory/types';
import { getMemoryStrategy } from '@/server/memory/getStrategy';
import { getDataset } from './dataset';
import { estimateTokens, recallAtK } from './metrics';

const ALL_STRATEGIES: StrategyName[] = ['recency', 'summary', 'semantic', 'hybrid'];
const SEED_EPOCH = Date.parse('2025-01-01T00:00:00.000Z');
const SEED_NPC_ID = 'lily'; // a seeded NPC (FK target for the eval user's thread)

export interface PerStrategyResult {
  name: StrategyName;
  recallAtK: number;
  latencyMs: number;
  tokenCost: number;
}

export interface MemoryEvalResult {
  datasetId: string;
  k: number;
  perStrategy: PerStrategyResult[];
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Runs the four memory strategies over a fixed labeled corpus and returns a per-strategy
// recall@k / latency / token-cost comparison. Seeds a throwaway eval user (so the caller's
// real memory is never touched), writes one MemoryRetrievalLog per (strategy × probe) for the
// caller, and deletes the eval user on the way out. ollama only needs `embed`.
export async function runMemoryEval(
  prisma: PrismaClient,
  ollama: Pick<OllamaClient, 'embed'>,
  callerUserId: string,
  opts: { datasetId?: string; k?: number } = {},
): Promise<MemoryEvalResult> {
  const dataset = getDataset(opts.datasetId);
  const k = opts.k ?? dataset.defaultK;

  const evalUser = await prisma.user.create({
    data: { username: `__memeval__${randomUUID()}`, password: 'x' },
  });

  try {
    // Seed the corpus with production-faithful embeddings and deterministic createdAt.
    const keyToId = new Map<string, string>();
    let thread: { id: string } | null = null;

    for (let i = 0; i < dataset.corpus.length; i++) {
      const item = dataset.corpus[i];
      const createdAt = new Date(SEED_EPOCH + i * 60_000);
      if (item.kind === 'fact') {
        const embedding = JSON.stringify(await ollama.embed(item.value)); // matches factExtract.ts
        const row = await prisma.memoryFact.create({
          data: {
            userId: evalUser.id,
            predicate: item.predicate,
            value: item.value,
            embedding,
            createdAt,
          },
        });
        keyToId.set(item.key, row.id);
      } else {
        if (!thread) {
          thread = await prisma.thread.create({ data: { userId: evalUser.id, npcId: SEED_NPC_ID } });
        }
        const embedding = JSON.stringify(await ollama.embed(item.summary));
        const row = await prisma.conversationSummary.create({
          data: {
            threadId: thread.id,
            fromMsgId: 'eval',
            toMsgId: 'eval',
            summary: item.summary,
            embedding,
            createdAt,
          },
        });
        keyToId.set(item.key, row.id);
      }
    }

    const perStrategy: PerStrategyResult[] = [];

    for (const name of ALL_STRATEGIES) {
      const strategy = getMemoryStrategy(name, { prisma, ollama });
      let recallSum = 0;
      let latencySum = 0;
      let tokenSum = 0;

      for (const probe of dataset.probes) {
        const started = Date.now();
        const items = await strategy.recall({ userId: evalUser.id, queryText: probe.queryText, k });
        const latencyMs = Date.now() - started;

        const topk = items.slice(0, k);
        const topkIds = topk.map((it) => it.id);
        const relevantIds = probe.relevantKeys
          .map((key) => keyToId.get(key))
          .filter((id): id is string => Boolean(id));
        const recall = recallAtK(topkIds, relevantIds);
        const tokenCost = topk.reduce((sum, it) => sum + estimateTokens(it.text), 0);

        recallSum += recall;
        latencySum += latencyMs;
        tokenSum += tokenCost;

        await prisma.memoryRetrievalLog.create({
          data: {
            userId: callerUserId,
            strategy: name,
            queryText: probe.queryText,
            retrievedIds: JSON.stringify(topkIds),
            k,
            latencyMs,
            tokenCost,
          },
        });
      }

      const n = dataset.probes.length;
      perStrategy.push({
        name,
        recallAtK: round3(recallSum / n),
        latencyMs: Math.round(latencySum / n),
        tokenCost: Math.round(tokenSum / n),
      });
    }

    return { datasetId: dataset.id, k, perStrategy };
  } finally {
    // Cascade clears the eval user's facts, thread, and summary. Caller-owned logs survive.
    await prisma.user.delete({ where: { id: evalUser.id } }).catch(() => {});
  }
}
