import { z } from 'zod';
import type { OllamaClient, ChatMessage } from '@/server/llm/ollama';
import { normalizeSignals, type LearningSignalCandidate } from '@/server/learning/signals';

export const CorrectionSchema = z.object({
  hasIssue: z.boolean(),
  fixed: z.string().default(''),
  noteZh: z.string().default(''),
  tag: z.string().default(''),
  // Signals are auxiliary model output. Validate them item-by-item below so one
  // malformed diagnosis cannot discard an otherwise valid correction.
  learningSignals: z.unknown().optional(),
});

export interface Correction {
  hasIssue: boolean;
  fixed: string;
  noteZh: string;
  tag: string;
  signals: LearningSignalCandidate[];
}

const SYSTEM_PROMPT =
  'You are an English writing coach for a Chinese-speaking learner. ' +
  "Given the learner's latest message (and the prior NPC line for context), decide whether it has a " +
  'grammar, word-choice, tense, article, or naturalness issue. ' +
  'Return JSON {"hasIssue": boolean, "fixed": <the corrected, natural English sentence, or "" if none>, ' +
  '"noteZh": <a one-sentence explanation IN CHINESE of the fix, or "">, ' +
  '"tag": <short category such as "grammar","word choice","tense","article", or "">, ' +
  '"learningSignals": <see below>}. ' +
  'If the message is already natural, return {"hasIssue": false, "fixed": "", "noteZh": "", "tag": "", "learningSignals": []}. ' +
  '"learningSignals" is an array of concrete mistake diagnoses (never success), each: ' +
  '{"skillCode": one of the fixed codes below, "polarity": "mistake", "score": number in [0,1] (0=severe, 1=near-perfect), ' +
  '"confidence": number in [0,1], "weight": 1, "evidence": <=120 chars of the exact learner substring at fault}. ' +
  'Only use these skill codes; omit rather than invent: ' +
  'grammar.past_tense, grammar.articles, grammar.modal_verbs, grammar.conditionals, grammar.tense_sequence, ' +
  'grammar.prepositions, grammar.subject_verb_agreement, grammar.plurals, grammar.relative_clauses, grammar.gerunds_infinitives, ' +
  'vocabulary.workplace, vocabulary.interview, vocabulary.marketing, vocabulary.social_casual, vocabulary.food_daily, vocabulary.academic, ' +
  'pragmatics.polite_disagreement, pragmatics.hedging, pragmatics.formal_register, pragmatics.small_talk, pragmatics.apology, ' +
  'pragmatics.making_requests, pragmatics.giving_feedback, pragmatics.expressing_uncertainty, ' +
  'interaction.self_introduction, interaction.describing_experience, interaction.expressing_opinion, interaction.narration, ' +
  'interaction.clarification, interaction.turn_taking. ' +
  'No prose outside the JSON.';

export interface CorrectionDeps {
  ollama: Pick<OllamaClient, 'chatJson'>;
  userText: string;
  npcPrev?: string;
}

// Module 6: one independent LLM JSON call. Returns the correction only when the model flags a real,
// non-empty fix; returns null on "no issue" or any failure. Never throws — correction is best-effort.
// A `hasIssue: false` result also drops any signals — success is not inferred from silence.
export async function correctGrammar(deps: CorrectionDeps): Promise<Correction | null> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: (deps.npcPrev ? `NPC said: ${deps.npcPrev}\n\n` : '') + `Learner said: ${deps.userText}` },
  ];
  try {
    const raw = await deps.ollama.chatJson(messages, CorrectionSchema);
    const hasIssue = raw.hasIssue;
    const fixed = raw.fixed ?? '';
    if (!hasIssue || !fixed.trim()) return null;
    // Force polarity=mistake — success signals never come from correction (see SYSTEM_PROMPT).
    const rawSignals = normalizeSignals(raw.learningSignals).map((s) => ({ ...s, polarity: 'mistake' as const }));
    return {
      hasIssue,
      fixed,
      noteZh: raw.noteZh ?? '',
      tag: raw.tag ?? '',
      signals: rawSignals,
    };
  } catch (e) {
    console.error('[correction] grammar check failed', e);
    return null;
  }
}
