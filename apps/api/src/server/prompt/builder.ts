import type { PromptContext } from './types';

const RELATIONSHIP_TONE: Record<string, string> = {
  acquaintance: 'You are still getting to know this person. Be friendly but a little reserved.',
  friend: 'You and this person are friends. Be warm, casual and familiar.',
  close: 'You are close friends. Be playful and affectionate, and tease lightly.',
};

const JSON_CONTRACT =
  'Respond ONLY with a JSON object matching: ' +
  '{"npcReply": string, "stateDelta": {"impression": number, "stress": "Low"|"Medium"|"High"}, ' +
  '"isFinalTurn": boolean, "suggestedChoicesNext": [{"id": string, "text": string, "tone": string, "desc": string}]}. ' +
  'No prose outside the JSON.';

export function buildSystemPrompt(ctx: PromptContext): string {
  const blocks: string[] = [];

  blocks.push(ctx.npc.personaPrompt.trim());

  const lp = ctx.npc.languageProfile;
  blocks.push(
    `Language: speak primarily in ${lp.primary}` +
      (lp.occasional.length ? `, occasionally using ${lp.occasional.join('/')}` : '') +
      `. Register: ${lp.register}.`,
  );

  if (ctx.userProfile) {
    const p = ctx.userProfile;
    const parts = [
      p.role && `role: ${p.role}`,
      p.goal && `learning goal: ${p.goal}`,
      p.interests?.length && `interests: ${p.interests.join(', ')}`,
    ].filter(Boolean);
    if (parts.length) blocks.push(`About the person you're talking to — ${parts.join('; ')}.`);
  }

  if (ctx.facts?.length) blocks.push(`What you remember about them:\n- ${ctx.facts.join('\n- ')}`);

  if (ctx.recentSummary) blocks.push(`Recent conversation summary: ${ctx.recentSummary}`);

  if (ctx.relationshipStage) blocks.push(RELATIONSHIP_TONE[ctx.relationshipStage]);

  if (ctx.userLanguage === 'zh-CN') {
    blocks.push(
      'The learner is a native Chinese speaker practising English. Stay in character even when they make mistakes; corrections are handled separately.',
    );
  }

  if (ctx.mode === 'scenario' && ctx.scenario) {
    blocks.push(`ROLEPLAY: you are now playing "${ctx.scenario.roleName}". ${ctx.scenario.instructions}`);
    blocks.push(JSON_CONTRACT);
  } else {
    // Casual chat: keep it texting-length. The scenario template sets its own length,
    // so only add this when not in roleplay.
    blocks.push(
      'Keep your replies short and natural, the way people actually text — usually one or two sentences. ' +
        'Do not lecture, bullet-point, or over-explain; if there is more to say, let them ask. Match their energy and length.',
    );
  }

  return blocks.join('\n\n');
}
