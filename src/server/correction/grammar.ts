import { z } from 'zod';
import type { OllamaClient, ChatMessage } from '@/server/llm/ollama';

export const CorrectionSchema = z.object({
  hasIssue: z.boolean(),
  fixed: z.string().default(''),
  noteZh: z.string().default(''),
  tag: z.string().default(''),
});
export type Correction = z.infer<typeof CorrectionSchema>;

const SYSTEM_PROMPT =
  'You are an English writing coach for a Chinese-speaking learner. ' +
  "Given the learner's latest message (and the prior NPC line for context), decide whether it has a " +
  'grammar, word-choice, tense, article, or naturalness issue. ' +
  'Return JSON {"hasIssue": boolean, "fixed": <the corrected, natural English sentence, or "" if none>, ' +
  '"noteZh": <a one-sentence explanation IN CHINESE of the fix, or "">, ' +
  '"tag": <short category such as "grammar","word choice","tense","article", or "">}. ' +
  'If the message is already natural, return {"hasIssue": false, "fixed": "", "noteZh": "", "tag": ""}. ' +
  'No prose outside the JSON.';

export interface CorrectionDeps {
  ollama: Pick<OllamaClient, 'chatJson'>;
  userText: string;
  npcPrev?: string;
}

// Module 6: one independent LLM JSON call. Returns the correction only when the model flags a real,
// non-empty fix; returns null on "no issue" or any failure. Never throws — correction is best-effort.
export async function correctGrammar(deps: CorrectionDeps): Promise<Correction | null> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: (deps.npcPrev ? `NPC said: ${deps.npcPrev}\n\n` : '') + `Learner said: ${deps.userText}` },
  ];
  try {
    const out = await deps.ollama.chatJson(messages, CorrectionSchema);
    if (!out.hasIssue || !out.fixed.trim()) return null;
    return out;
  } catch (e) {
    console.error('[correction] grammar check failed', e);
    return null;
  }
}
