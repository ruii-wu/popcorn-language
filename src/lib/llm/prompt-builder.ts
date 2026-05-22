import type { ChatMessage } from './ollama';

// ----------------------------------------------------------------------------
// Inputs — deliberately decoupled from Prisma model types so unit tests and
// future caching layers don't drag in the DB client.
// ----------------------------------------------------------------------------

export interface NpcInput {
  id: string;
  name: string;
  shortBio: string;
  personaPrompt: string;
  languageProfile: LanguageProfile;
  topicInterests: string[];
  scenarioRoles: ScenarioRole[];
}

export interface LanguageProfile {
  primary: 'en' | 'zh';
  occasional: ('en' | 'zh')[];
  register: string;
  codeSwitchTolerance?: 'none' | 'low' | 'high' | 'native' | 'none-but-curious';
  preferredPattern?: 'bilingual-mirror' | 'monolingual';
}

export interface ScenarioRole {
  id: string;
  name: string;
  voice: string;
  defaultStress: 'Low' | 'Medium' | 'High';
  backstory?: string;
}

export interface UserProfileInput {
  displayName?: string;
  language: string;       // user's native language (e.g. zh-CN)
  targetLang: string;     // language they're practising (e.g. en-US)
  cefrLevel?: string;
  role?: string;
  goal?: string;
  interests?: string[];
}

export interface RelationshipInput {
  stage: 'acquaintance' | 'friend' | 'close';
  stageValue: number;
  conversationCount: number;
  scenarioCount: number;
}

export interface MemoryFactInput {
  predicate: string;
  value: string;
  confidence: number;
}

export interface RecentMessage {
  role: 'user' | 'assistant';
  text: string;
}

export type Mode = 'casual' | 'scenario' | 'correction' | 'summary' | 'memory-extract';

export interface BuildPromptArgs {
  npc: NpcInput;
  user: UserProfileInput;
  relationship: RelationshipInput;
  facts?: MemoryFactInput[];
  summary?: string | null;       // long-term running summary of this thread
  recent?: RecentMessage[];      // recent buffer (will be passed as multi-message context)
  mode?: Mode;
  // Scenario-specific add-ons
  scenarioRoleId?: string;
  scenarioSystemPrompt?: string; // template-defined extra block (JSON contract etc.)
  scenarioState?: Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// Public: assemble the system prompt (single string).
// ----------------------------------------------------------------------------

export function buildSystemPrompt(args: BuildPromptArgs): string {
  const mode = args.mode ?? 'casual';

  const blocks: string[] = [];
  blocks.push(args.npc.personaPrompt.trim());

  blocks.push(renderLanguageBlock(args.npc.languageProfile, args.user));
  blocks.push(renderUserBlock(args.user));
  blocks.push(renderRelationshipBlock(args.npc.name, args.relationship));

  if (args.facts && args.facts.length > 0) {
    blocks.push(renderFactsBlock(args.npc.name, args.facts));
  }
  if (args.summary && args.summary.trim()) {
    blocks.push(renderSummaryBlock(args.summary));
  }

  blocks.push(renderModeBlock(mode, args));

  return blocks.filter(Boolean).map((b) => b.trim()).join('\n\n');
}

// ----------------------------------------------------------------------------
// Public: assemble the full ChatMessage[] payload for Ollama.
// system prompt + recent buffer (capped) + (caller appends the new user msg).
// ----------------------------------------------------------------------------

export interface BuildMessagesArgs extends BuildPromptArgs {
  recentBufferLimit?: number; // default 10 pairs
}

export function buildMessages(args: BuildMessagesArgs): ChatMessage[] {
  const limit = (args.recentBufferLimit ?? 10) * 2;
  const recent = (args.recent ?? []).slice(-limit);
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(args) },
  ];
  for (const m of recent) {
    messages.push({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    });
  }
  return messages;
}

// ----------------------------------------------------------------------------
// Public: scenario prompt — wraps the template's system block with state.
// Caller should still concatenate the running thread context (recent buffer).
// ----------------------------------------------------------------------------

export interface BuildScenarioMessagesArgs {
  npc: NpcInput;
  user: UserProfileInput;
  relationship: RelationshipInput;
  scenarioRoleId: string;
  scenarioSystemPrompt: string;
  scenarioState: Record<string, unknown>;
  recent: RecentMessage[]; // includes the just-arrived user choice/text
}

export function buildScenarioMessages(args: BuildScenarioMessagesArgs): ChatMessage[] {
  const role = args.npc.scenarioRoles.find((r) => r.id === args.scenarioRoleId);
  if (!role) {
    throw new Error(`scenarioRoleId "${args.scenarioRoleId}" not found on NPC ${args.npc.id}`);
  }
  const system = buildSystemPrompt({
    npc: args.npc,
    user: args.user,
    relationship: args.relationship,
    mode: 'scenario',
    scenarioRoleId: args.scenarioRoleId,
    scenarioSystemPrompt: args.scenarioSystemPrompt,
    scenarioState: args.scenarioState,
  });
  return [
    { role: 'system', content: system },
    ...args.recent.map((m) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    })),
  ];
}

// ============================================================================
// Block renderers — kept as small pure functions so each is easy to test.
// ============================================================================

function renderLanguageBlock(lp: LanguageProfile, user: UserProfileInput): string {
  const userNative = user.language.toLowerCase().startsWith('zh') ? 'Chinese' : 'English';
  const target = user.targetLang.toLowerCase().startsWith('en') ? 'English' : 'Chinese';
  const codeSwitch = lp.codeSwitchTolerance ?? 'low';

  const lines = [
    '## LANGUAGE CONTEXT',
    `- The user's native language is ${userNative}. They are practising ${target}.`,
    `- Your default reply language: ${lp.primary === 'en' ? 'English' : 'Chinese'}.`,
  ];
  if (lp.preferredPattern === 'bilingual-mirror') {
    lines.push('- Use the bilingual mirror pattern: reply in English first, then the same point in Chinese on the next line.');
  }
  if (codeSwitch === 'native' || codeSwitch === 'high') {
    lines.push('- Code-switching from the user is welcome; mirror it lightly.');
  } else if (codeSwitch === 'none-but-curious') {
    lines.push('- You do not speak Chinese; if the user uses Chinese, ask them what it means in a friendly way.');
  } else {
    lines.push('- Stay primarily in your default language even if the user mixes.');
  }
  if (user.cefrLevel) {
    lines.push(`- The user's CEFR level is ${user.cefrLevel}. Keep vocabulary and sentence length appropriate; avoid idioms the user is unlikely to know unless you naturally explain them.`);
  }
  return lines.join('\n');
}

function renderUserBlock(user: UserProfileInput): string {
  const lines = ['## ABOUT THE USER'];
  if (user.displayName) lines.push(`- Name they go by: ${user.displayName}.`);
  if (user.role) lines.push(`- Role: ${user.role}.`);
  if (user.goal) lines.push(`- Learning ${user.targetLang.toLowerCase().startsWith('en') ? 'English' : 'Chinese'} for: ${user.goal}.`);
  if (user.interests && user.interests.length > 0) {
    lines.push(`- Interests: ${user.interests.join(', ')}.`);
  }
  return lines.length === 1 ? '' : lines.join('\n');
}

function renderRelationshipBlock(npcName: string, rel: RelationshipInput): string {
  const stageHint = {
    acquaintance: 'You barely know each other yet. Stay polite, curious, not too familiar.',
    friend:       'You\'ve chatted enough to feel comfortable. Tease lightly, remember shared context.',
    close:        'You\'re close friends. Be warm and casual. Reference inside jokes naturally if any exist in the summary or facts.',
  }[rel.stage];
  return [
    '## RELATIONSHIP',
    `- Your relationship with the user is "${rel.stage}" (level ${rel.stageValue}/3).`,
    `- ${stageHint}`,
    `- Past stats: ${rel.conversationCount} conversations · ${rel.scenarioCount} scenarios together.`,
  ].join('\n');
}

function renderFactsBlock(npcName: string, facts: MemoryFactInput[]): string {
  // Show high-confidence facts first; cap at 12 to keep prompt lean.
  const sorted = [...facts].sort((a, b) => b.confidence - a.confidence).slice(0, 12);
  const lines = [`## WHAT ${npcName.toUpperCase()} REMEMBERS ABOUT THE USER`];
  for (const f of sorted) {
    lines.push(`- ${humanizePredicate(f.predicate)}: ${f.value}`);
  }
  lines.push('Reference these naturally when relevant — never recite them as a list.');
  return lines.join('\n');
}

function humanizePredicate(p: string): string {
  return p.replace(/_/g, ' ');
}

function renderSummaryBlock(summary: string): string {
  return [
    '## STORY SO FAR',
    summary.trim(),
  ].join('\n');
}

function renderModeBlock(mode: Mode, args: BuildPromptArgs): string {
  switch (mode) {
    case 'casual':
      return [
        '## CURRENT MODE: CASUAL CHAT',
        '- Respond as yourself in 1-3 short messages worth of text.',
        '- Do NOT produce JSON. Output plain text only.',
        '- Do NOT prefix your message with your name.',
      ].join('\n');

    case 'scenario': {
      const role = args.npc.scenarioRoles.find((r) => r.id === args.scenarioRoleId);
      const stateStr = args.scenarioState ? JSON.stringify(args.scenarioState) : '{}';
      const lines = [
        '## CURRENT MODE: SCENARIO ROLEPLAY',
        role
          ? `- You are roleplaying as "${role.name}" (${role.voice}). The user knows it is you, but stay in character.`
          : '- You are in a scenario roleplay — stay in character.',
        `- Current scenario state: ${stateStr}`,
      ];
      if (args.scenarioSystemPrompt) {
        lines.push('', '## SCENARIO TEMPLATE INSTRUCTIONS', args.scenarioSystemPrompt.trim());
      }
      return lines.join('\n');
    }

    case 'correction':
      return [
        '## CURRENT MODE: GRAMMAR CORRECTION',
        'You are the silent correction layer, not the NPC.',
        'Analyze ONLY the most recent user message. Return JSON matching the schema the caller provides.',
        'Do not roleplay or chat. Output JSON only.',
      ].join('\n');

    case 'summary':
      return [
        '## CURRENT MODE: SUMMARIZATION',
        'You are summarizing a chat history into a short narrative paragraph (3-5 sentences) the NPC can recall later.',
        'Focus on durable facts and the emotional arc, not turn-by-turn details. Output plain text only.',
      ].join('\n');

    case 'memory-extract':
      return [
        '## CURRENT MODE: FACT EXTRACTION',
        'Extract durable user facts from the conversation provided.',
        'Return JSON matching the schema the caller provides. No prose.',
      ].join('\n');
  }
}

// ----------------------------------------------------------------------------
// Convenience: render the user's just-sent message into a ChatMessage. The
// route handler calls buildMessages() for system+recent then pushes this.
// ----------------------------------------------------------------------------

export function userMessage(text: string): ChatMessage {
  return { role: 'user', content: text };
}
