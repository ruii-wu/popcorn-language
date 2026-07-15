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

export function mapMessageToApi(m: MessageRow) {
  const retracted = !!m.retractedAt;
  return {
    id: m.id,
    role: m.role,
    text: retracted ? 'Message retracted' : m.text,
    retractedText: retracted ? m.text : null,
    from: m.userId ? 'user' : 'npc',
    correction: m.correction ? JSON.parse(m.correction) : null,
    lang: m.langDetect,
    retracted,
    createdAt: m.createdAt,
  };
}
