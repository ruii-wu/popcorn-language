// src/server/scenario/sessionView.ts
import type { ScenarioChoice, ScenarioSummary } from '@popcorn/shared';
import { ChoiceSchema } from './schemas';
import { buildLearningUpdate, parseSnapshot } from '@/server/learning/learningUpdate';
interface TemplateLite { id: string; title: string; titleZh: string | null }

interface SummaryRow {
  grade: string;
  languageNote: string;
  pragmaticsNote: string;
  relationshipNote: string;
  preLevels?: string | null;
  postLevels?: string | null;
}

interface SessionRow {
  id: string;
  npcId: string;
  status: string;
  state: string;
  invitedAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  triggerRationale: string | null;
  template: TemplateLite;
  summary?: SummaryRow | null;
}

interface MessageRow {
  id: string;
  role: string;
  text: string;
  userId: string | null;
  meta: string | null;
  createdAt: Date;
}

export interface SessionListItem {
  id: string;
  scenarioTitle: string;
  npcId: string;
  status: string;
  grade: string | null;
  startedAt: Date | null;
}

export interface SessionDetail {
  session: {
    id: string;
    npcId: string;
    scenarioTitle: string;
    titleZh: string | null;
    status: string;
    grade: string | null;
    invitedAt: Date;
    startedAt: Date | null;
    endedAt: Date | null;
    rationale: unknown;
  };
  transcript: { id: string; role: string; from: 'user' | 'npc'; text: string; meta: unknown; createdAt: Date }[];
  state: unknown;
  choices: ScenarioChoice[];
  summary: ScenarioSummary | null;
}

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function safeChoices(raw: string | null | undefined): ScenarioChoice[] {
  const parsed = safeParse(raw ?? null);
  const result = ChoiceSchema.array().safeParse(parsed);
  return result.success ? result.data : [];
}

export function mapSessionListItem(s: SessionRow): SessionListItem {
  return {
    id: s.id,
    scenarioTitle: s.template.title,
    npcId: s.npcId,
    status: s.status,
    grade: s.summary?.grade ?? null,
    startedAt: s.startedAt,
  };
}

export function mapSessionDetail(s: SessionRow, messages: MessageRow[], latestChoices?: string | null): SessionDetail {
  return {
    session: {
      id: s.id,
      npcId: s.npcId,
      scenarioTitle: s.template.title,
      titleZh: s.template.titleZh,
      status: s.status,
      grade: s.summary?.grade ?? null,
      invitedAt: s.invitedAt,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      rationale: safeParse(s.triggerRationale),
    },
    transcript: messages.map((m) => ({
      id: m.id,
      role: m.role,
      from: m.userId ? 'user' : 'npc',
      text: m.text,
      meta: safeParse(m.meta),
      createdAt: m.createdAt,
    })),
    state: safeParse(s.state),
    choices: safeChoices(latestChoices),
    summary: s.summary ? {
      grade: s.summary.grade,
      languageNote: s.summary.languageNote,
      pragmaticsNote: s.summary.pragmaticsNote,
      relationshipNote: s.summary.relationshipNote,
      learningUpdate: buildLearningUpdate(
        parseSnapshot(s.summary.preLevels ?? null),
        parseSnapshot(s.summary.postLevels ?? null),
      ),
    } : null,
  };
}
