export interface MessageRow {
  id: string;
  role: string;
  text: string;
  userId: string | null;
  correction: string | null;
  langDetect: string | null;
  retractedAt: Date | null;
  createdAt: Date;
}

export interface CompletedScenarioRow {
  id: string;
  invitedAt: Date;
  endedAt: Date | null;
  template: { title: string };
  summary: { grade: string } | null;
}

export function mapMessageToApi(m: MessageRow) {
  const retracted = !!m.retractedAt;
  return {
    id: m.id,
    kind: 'message' as const,
    role: m.role,
    text: retracted ? 'Message retracted' : m.text,
    retractedText: retracted ? m.text : null,
    from: m.userId ? 'user' : 'npc',
    correction: m.correction ? JSON.parse(m.correction) : null,
    lang: m.langDetect,
    retracted,
    createdAt: m.createdAt,
    scenarioSessionId: null,
    scenarioTitle: null,
    scenarioGrade: null,
  };
}

export function mapCompletedScenarioToApi(session: CompletedScenarioRow) {
  return {
    id: `scenario:${session.id}`,
    kind: 'scenario' as const,
    role: 'scenario',
    text: `${session.template.title} completed`,
    retractedText: null,
    from: 'npc',
    correction: null,
    lang: null,
    retracted: false,
    createdAt: session.endedAt ?? session.invitedAt,
    scenarioSessionId: session.id,
    scenarioTitle: session.template.title,
    scenarioGrade: session.summary?.grade ?? null,
  };
}
