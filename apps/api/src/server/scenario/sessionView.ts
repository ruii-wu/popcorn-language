// src/server/scenario/sessionView.ts
interface TemplateLite { id: string; title: string; titleZh: string | null }

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
  summary?: { grade: string } | null;
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
}

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
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

export function mapSessionDetail(s: SessionRow, messages: MessageRow[]): SessionDetail {
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
  };
}
