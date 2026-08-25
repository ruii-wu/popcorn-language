// SSE-over-POST event types — the client-facing (`{ type, data }`) shape that
// `parseFrame` produces from each `event:`/`data:` frame. Hand-mirrored from the
// server emitters (src/server/chat/streamChat.ts, src/server/scenario/{turn,end}.ts);
// the server yields the same payloads keyed `event` instead of `type`.

// chat grammar-correction payload (correction event)
export interface GrammarCorrection {
  fixed: string;
  noteZh: string;
  tag: string;
}

// one scenario response option (choices event)
export interface ScenarioChoice {
  id: string;
  text: string;
  tone?: string;
  desc?: string;
}

export type ScenarioStress = 'Low' | 'Medium' | 'High';

// scenario grading summary (scenario_end event)
export interface LearningUpdateItem {
  skillCode: string;
  labelEn: string;
  labelZh: string;
  before: number;
  after: number;
  delta: number;
  status: 'gathering' | 'needs_practice' | 'developing' | 'solid' | 'strong';
}

export interface ScenarioSummary {
  grade: string;
  languageNote: string;
  pragmaticsNote: string;
  relationshipNote: string;
  learningUpdate?: LearningUpdateItem[];
}

// POST /api/threads/:npcId/messages (chat send)
export type ChatStreamEvent =
  | { type: 'user_message_saved'; data: { messageId: string; createdAt: string | Date } }
  | { type: 'typing_start'; data: { npcId: string } }
  | { type: 'token'; data: { delta: string } }
  | { type: 'typing_end'; data: { npcId: string } }
  | { type: 'message_complete'; data: { messageId: string; fullText: string } }
  | { type: 'correction'; data: { targetMessageId: string; correction: GrammarCorrection } }
  | { type: 'scenario_offer'; data: { sessionId: string; draft: unknown } }
  | { type: 'error'; data: { code: string; message?: string } }
  | { type: 'done'; data: Record<string, never> };

// POST /api/scenarios/sessions/:id/choose (scenario turn)
export type ScenarioStreamEvent =
  | { type: 'user_message_saved'; data: { messageId: string; createdAt: string | Date } }
  | { type: 'typing_start'; data: { npcId: string } }
  | { type: 'typing_end'; data: { npcId: string } }
  | { type: 'message_complete'; data: { messageId: string; fullText: string } }
  | { type: 'state_update'; data: { impression: number; stress: ScenarioStress; turnsLeft: number } }
  | { type: 'choices'; data: { choices: ScenarioChoice[] } }
  | { type: 'scenario_end'; data: { summary: ScenarioSummary; memoryId: string | null; relationshipChange: unknown } }
  | { type: 'error'; data: { code: string; message?: string } }
  | { type: 'done'; data: Record<string, never> };
