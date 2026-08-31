// src/server/scenario/prompt.ts
import type { ChatMessage } from '@/server/llm/ollama';
import type { ScenarioState } from './state';

const JSON_CONTRACT =
  'Respond ONLY with a JSON object matching: ' +
  '{"npcReply": string, "stateDelta": {"impression": number, "stress": "Low"|"Medium"|"High"}, ' +
  '"isFinalTurn": boolean, "suggestedChoicesNext": [{"id": string, "text": string, "tone": string, "desc": string}]}. ' +
  'No prose outside the JSON.';

export function buildScenarioSystem(args: {
  roleName: string;
  instructions: string;
  userLanguage: string;
  state: ScenarioState;
  previousChoiceTexts?: string[];
  mustConclude?: boolean;
}): string {
  const previousChoices = args.previousChoiceTexts?.slice(-12) ?? [];
  return [
    `ROLEPLAY: You are "${args.roleName}". ${args.instructions} Keep each reply to 1-3 sentences and stay in character.`,
    `Current state — impression: ${args.state.impression}/10, stress: ${args.state.stress}, suggestedTurnsLeft: ${args.state.turnsLeft}.`,
    '"stateDelta.impression" is a small delta from -3 to +3 to add to the current impression based on how the user just did. ' +
      '"suggestedTurnsLeft" is only a pacing guide, not a forced countdown. Set "isFinalTurn": true only when the roleplay goal has been resolved and "npcReply" is a natural closing statement with no new question or task. ' +
      'When the pacing guide reaches zero, look for the earliest natural opportunity to wrap up, but continue if a question, decision, or task is still unresolved. ' +
      'For a non-final turn, provide exactly 3 "suggestedChoicesNext". Write each as a complete first-person reply that directly answers the specific final question or request in "npcReply". ' +
      'The choices must differ in both communicative strategy and substantive content; changing only the tone or paraphrasing the same answer does not count. ' +
      'Do not introduce people, places, events, or topics that are absent from this roleplay. For a final turn, return an empty choices array.',
    previousChoices.length > 0
      ? `Do not reuse or closely paraphrase any earlier suggested reply: ${JSON.stringify(previousChoices)}.`
      : '',
    args.mustConclude
      ? 'This is the final safety-limit exchange. Give a natural in-character closing now, do not ask another question or introduce a new task, set "isFinalTurn" to true, and return an empty choices array.'
      : '',
    args.userLanguage === 'zh-CN'
      ? 'The user is a native Chinese speaker practising English; stay in character even if they make mistakes.'
      : '',
    JSON_CONTRACT,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildScenarioMessages(args: {
  roleName: string;
  instructions: string;
  userLanguage: string;
  state: ScenarioState;
  history: { role: string; text: string; userId: string | null }[];
  previousChoiceTexts?: string[];
  mustConclude?: boolean;
  opening?: boolean;
}): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildScenarioSystem(args) },
    ...args.history.map((m): ChatMessage => ({ role: m.userId ? 'user' : 'assistant', content: m.text })),
  ];
  if (args.opening) {
    messages.push({ role: 'user', content: '(The candidate has just sat down. Greet them in character and ask your first question.)' });
  }
  return messages;
}
