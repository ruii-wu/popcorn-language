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
}): string {
  return [
    `ROLEPLAY: You are "${args.roleName}". ${args.instructions} Keep each reply to 1-3 sentences and stay in character.`,
    `Current state — impression: ${args.state.impression}/10, stress: ${args.state.stress}, turnsLeft: ${args.state.turnsLeft}.`,
    '"stateDelta.impression" is a small delta from -3 to +3 to add to the current impression based on how the user just did. ' +
      'Set "isFinalTurn": true when turnsLeft is 1 or fewer, or the conversation reaches a natural close. ' +
      'Provide exactly 3 "suggestedChoicesNext" with distinct tones (e.g. Diplomatic / Confident / Reflective).',
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
