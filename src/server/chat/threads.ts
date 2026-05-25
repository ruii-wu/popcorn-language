export interface MessageRow {
  id: string;
  role: string;
  text: string;
  userId: string | null;
  correction: string | null;
  langDetect: string | null;
  createdAt: Date;
}

export function mapMessageToApi(m: MessageRow) {
  return {
    id: m.id,
    role: m.role,
    text: m.text,
    from: m.userId ? 'user' : 'npc',
    correction: m.correction ? JSON.parse(m.correction) : null,
    lang: m.langDetect,
    createdAt: m.createdAt,
  };
}
