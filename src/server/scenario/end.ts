// src/server/scenario/end.ts
import type { PrismaClient, ScenarioSession, ScenarioTemplate, Npc } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';
import type { SseEvent } from '@/server/sse/events';
import type { ScenarioState } from './state';
import { ScenarioSummarySchema, type ScenarioSummaryJson } from './schemas';
import { applyScenarioOutcome } from './relationship';
import { generateMemoryCard } from '@/server/memory/memoryCard';
import { runAchievementTick } from '@/server/achievements/engine';

const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', '—'];

export function normalizeGrade(raw: string): string {
  const g = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (GRADES.includes(g)) return g;
  const letter = g[0];
  if (letter === 'A' || letter === 'B' || letter === 'C') return letter;
  return '—';
}

export interface EndDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson' | 'embed'>;
  session: ScenarioSession & { template: ScenarioTemplate; npc: Npc };
  state: ScenarioState;
}

export async function* runScenarioEnd(deps: EndDeps): AsyncGenerator<SseEvent> {
  const { prisma, ollama, session } = deps;

  const history = await prisma.message.findMany({
    where: { scenarioSessionId: session.id, role: { in: ['user', 'npc-roleplay'] } },
    orderBy: { createdAt: 'asc' },
  });
  const transcript = history.map((m) => `${m.userId ? 'User' : 'NPC'}: ${m.text}`).join('\n');

  let summary: ScenarioSummaryJson;
  try {
    summary = await ollama.chatJson(
      [
        {
          role: 'system',
          content:
            'You are an English-coaching evaluator. Grade the learner\'s performance in this roleplay. ' +
            'Return JSON {"grade": one of "A+","A","A-","B+","B","B-","C","—"; ' +
            '"languageNote": string; "pragmaticsNote": string; "relationshipNote": string}. ' +
            'Each note is 1-2 encouraging, specific sentences.',
        },
        { role: 'user', content: transcript },
      ],
      ScenarioSummarySchema,
    );
  } catch (e) {
    console.error('[scenario] summary generation failed, using fallback', e);
    summary = { grade: '—', languageNote: 'Summary unavailable.', pragmaticsNote: '', relationshipNote: '' };
  }
  const grade = normalizeGrade(summary.grade);

  await prisma.scenarioSummary.create({
    data: {
      sessionId: session.id, grade,
      languageNote: summary.languageNote, pragmaticsNote: summary.pragmaticsNote, relationshipNote: summary.relationshipNote,
    },
  });
  await prisma.message.create({
    data: {
      threadId: session.threadId, userId: null, role: 'summary',
      text: [summary.languageNote, summary.pragmaticsNote, summary.relationshipNote].filter(Boolean).join('\n'),
      scenarioSessionId: session.id, meta: JSON.stringify({ summarySessionId: session.id, grade }),
    },
  });

  const memory = await generateMemoryCard({
    prisma, ollama, userId: session.userId, npcId: session.npcId, sessionId: session.id, transcript, grade,
  });
  const relationshipChange = await applyScenarioOutcome(prisma, session.userId, session.npcId, grade, session.template.title);

  await prisma.activityEvent.create({
    data: { userId: session.userId, type: 'scenario_completed', payload: JSON.stringify({ sessionId: session.id, grade }) },
  });
  await prisma.scenarioSession.update({ where: { id: session.id }, data: { status: 'completed', endedAt: new Date() } });
  await runAchievementTick(prisma, session.userId);

  yield {
    event: 'scenario_end',
    data: {
      summary: { grade, languageNote: summary.languageNote, pragmaticsNote: summary.pragmaticsNote, relationshipNote: summary.relationshipNote },
      memoryId: memory?.id ?? null,
      relationshipChange,
    },
  };
}
