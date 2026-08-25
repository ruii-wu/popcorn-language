// src/server/scenario/end.ts
import type { PrismaClient, ScenarioSession, ScenarioSummary, ScenarioTemplate, Npc } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';
import type { SseEvent } from '@/server/sse/events';
import type { ScenarioState } from './state';
import { ScenarioSummarySchema, type ScenarioSummaryJson } from './schemas';
import { applyScenarioOutcome } from './relationship';
import { generateMemoryCard } from '@/server/memory/memoryCard';
import { runAchievementTick } from '@/server/achievements/engine';
import { writeSignals } from '@/server/learning/signals';
import { getSkill } from '@/server/learning/taxonomy';
import { computeLearnerModel } from '@/server/learning/aggregate';
import { buildLearningUpdate, parseSnapshot, type SkillSnapshot } from '@/server/learning/learningUpdate';

const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', '—'];

export function normalizeGrade(raw: string): string {
  const g = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (GRADES.includes(g)) return g;
  const letter = g[0];
  if (letter === 'A' || letter === 'B' || letter === 'C') return letter;
  return '—';
}

function parseTargetSkills(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function skillAssessmentPrompt(targetSkills: string[]): string {
  if (targetSkills.length === 0) return '';
  const list = targetSkills
    .map((code) => {
      const skill = getSkill(code);
      return skill ? `- ${code} (${skill.labelEn})` : `- ${code}`;
    })
    .join('\n');
  return (
    ' Also emit "skillAssessments": an array of per-skill ratings, one per target skill listed below (skip a skill only if the transcript gives no evidence at all). ' +
    'Each item: {"skillCode": one of the codes below, "polarity": "success" | "mistake", "score": number in [0,1] (0=very weak, 1=native-like), ' +
    '"confidence": number in [0,1], "weight": 1, "evidence": <=120 chars quoting a learner turn}. ' +
    'Only use these codes; omit any not observed:\n' + list
  );
}

export interface EndDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson' | 'embed'>;
  session: ScenarioSession & { template: ScenarioTemplate; npc: Npc };
  state: ScenarioState;
}

interface CompletionCommit {
  summary: ScenarioSummary;
  relationshipChange: { from: string; to: string } | null;
}

export async function* runScenarioEnd(deps: EndDeps): AsyncGenerator<SseEvent> {
  const { prisma, ollama, session } = deps;
  const targetSkills = parseTargetSkills(session.template.targetSkills);

  const history = await prisma.message.findMany({
    where: { scenarioSessionId: session.id, role: { in: ['user', 'npc-roleplay'] } },
    orderBy: { createdAt: 'asc' },
  });
  const transcript = history.map((m) => `${m.userId ? 'User' : 'NPC'}: ${m.text}`).join('\n');

  // {level, evidenceN} pairs let the summary status buckets match Journey's.
  // The client parameter allows the post snapshot to observe the same transaction
  // that claims completion and writes the immutable evidence.
  async function snapshotTargetSkills(
    client: Pick<PrismaClient, 'user' | 'learningSignal'>,
  ): Promise<Record<string, SkillSnapshot>> {
    if (targetSkills.length === 0) return {};
    const model = await computeLearnerModel({
      prisma: client,
      userId: session.userId,
    });
    const out: Record<string, SkillSnapshot> = {};
    for (const skill of model.skills) {
      if (targetSkills.includes(skill.skillCode)) {
        out[skill.skillCode] = {
          level: Number(skill.level.toFixed(4)),
          evidenceN: skill.evidenceN,
        };
      }
    }
    return out;
  }

  // A completed session can re-enter this function to compensate optional work
  // such as a failed Memory card. Never ask the model to evaluate it again.
  const existing = await prisma.scenarioSession.findFirst({
    where: { id: session.id, userId: session.userId, status: 'completed' },
    include: { summary: true },
  });
  let completion: CompletionCommit | null = existing?.summary
    ? { summary: existing.summary, relationshipChange: null }
    : null;

  if (!completion) {
    let summary: ScenarioSummaryJson;
    try {
      summary = await ollama.chatJson(
        [
          {
            role: 'system',
            content:
              'You are an English-coaching evaluator. Grade the learner\'s performance in this roleplay. ' +
              'Return JSON {"grade": one of "A+","A","A-","B+","B","B-","C","—"; ' +
              '"languageNote": string; "pragmaticsNote": string; "relationshipNote": string; ' +
              '"skillAssessments": array}. ' +
              'Each note is 1-2 encouraging, specific sentences.' +
              skillAssessmentPrompt(targetSkills),
          },
          { role: 'user', content: transcript },
        ],
        ScenarioSummarySchema,
      );
    } catch (e) {
      console.error('[scenario] summary generation failed, using fallback', e);
      summary = {
        grade: '—',
        languageNote: 'Summary unavailable.',
        pragmaticsNote: '',
        relationshipNote: '',
      };
    }
    const grade = normalizeGrade(summary.grade);
    completion = await prisma.$transaction(async (tx): Promise<CompletionCommit | null> => {
      const claim = await tx.scenarioSession.updateMany({
        where: { id: session.id, userId: session.userId, status: 'active' },
        data: { status: 'completed', endedAt: new Date() },
      });
      if (claim.count === 0) return null;

      // Replace any legacy orphan evidence only after winning the completion claim.
      // From here onward Summary and Signals are one atomic evaluation.
      await tx.learningSignal.deleteMany({
        where: {
          userId: session.userId,
          sourceType: 'scenario_summary',
          sourceRef: session.id,
        },
      });
      const preSnapshot = await snapshotTargetSkills(tx);
      await writeSignals({
        prisma: tx,
        userId: session.userId,
        sourceType: 'scenario_summary',
        sourceRef: session.id,
        signals: summary.skillAssessments ?? [],
        npcId: session.npcId,
        scenarioSessionId: session.id,
        allowedSkills: targetSkills,
        throwOnError: true,
      });
      const postSnapshot = await snapshotTargetSkills(tx);

      const persistedSummary = await tx.scenarioSummary.upsert({
        where: { sessionId: session.id },
        create: {
          sessionId: session.id,
          grade,
          languageNote: summary.languageNote,
          pragmaticsNote: summary.pragmaticsNote,
          relationshipNote: summary.relationshipNote,
          preLevels: JSON.stringify(preSnapshot),
          postLevels: JSON.stringify(postSnapshot),
        },
        update: {
          grade,
          languageNote: summary.languageNote,
          pragmaticsNote: summary.pragmaticsNote,
          relationshipNote: summary.relationshipNote,
          preLevels: JSON.stringify(preSnapshot),
          postLevels: JSON.stringify(postSnapshot),
        },
      });

      const summaryMessage = await tx.message.findFirst({
        where: { scenarioSessionId: session.id, role: 'summary' },
        select: { id: true },
      });
      if (!summaryMessage) {
        await tx.message.create({
          data: {
            threadId: session.threadId,
            userId: null,
            role: 'summary',
            text: [
              persistedSummary.languageNote,
              persistedSummary.pragmaticsNote,
              persistedSummary.relationshipNote,
            ].filter(Boolean).join('\n'),
            scenarioSessionId: session.id,
            meta: JSON.stringify({ summarySessionId: session.id, grade: persistedSummary.grade }),
          },
        });
      }

      const existingCompletionEvent = await tx.activityEvent.findFirst({
        where: {
          userId: session.userId,
          type: 'scenario_completed',
          payload: { contains: `\"sessionId\":\"${session.id}\"` },
        },
        select: { id: true },
      });
      const relationshipChange = existingCompletionEvent
        ? null
        : await applyScenarioOutcome(
            tx,
            session.userId,
            session.npcId,
            persistedSummary.grade,
            session.template.title,
          );
      if (!existingCompletionEvent) {
        await tx.activityEvent.create({
          data: {
            userId: session.userId,
            type: 'scenario_completed',
            payload: JSON.stringify({
              sessionId: session.id,
              templateId: session.templateId,
              grade: persistedSummary.grade,
            }),
          },
        });
      }

      return { summary: persistedSummary, relationshipChange };
    });

    if (!completion) {
      const persisted = await prisma.scenarioSession.findFirst({
        where: { id: session.id, userId: session.userId, status: 'completed' },
        include: { summary: true },
      });
      if (!persisted?.summary) {
        throw new Error(`Scenario ${session.id} could not be completed from status ${persisted?.status ?? 'unknown'}`);
      }
      completion = { summary: persisted.summary, relationshipChange: null };
    }
  }

  let memory = await prisma.memory.findFirst({
    where: { userId: session.userId, sourceType: 'scenario', sourceRef: session.id },
    orderBy: { noticedAt: 'asc' },
  });
  if (!memory) {
    memory = await generateMemoryCard({
      prisma,
      ollama,
      userId: session.userId,
      npcId: session.npcId,
      sessionId: session.id,
      transcript,
      grade: completion.summary.grade,
    });
  }
  await runAchievementTick(prisma, session.userId);

  const persistedLearningUpdate = buildLearningUpdate(
    parseSnapshot(completion.summary.preLevels),
    parseSnapshot(completion.summary.postLevels),
  );

  yield {
    event: 'scenario_end',
    data: {
      summary: {
        grade: completion.summary.grade,
        languageNote: completion.summary.languageNote,
        pragmaticsNote: completion.summary.pragmaticsNote,
        relationshipNote: completion.summary.relationshipNote,
        learningUpdate: persistedLearningUpdate,
      },
      memoryId: memory?.id ?? null,
      relationshipChange: completion.relationshipChange,
    },
  };
}
