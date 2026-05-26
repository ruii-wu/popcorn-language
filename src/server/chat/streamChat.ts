import type { PrismaClient } from '@prisma/client';
import type { OllamaClient, ChatMessage } from '@/server/llm/ollama';
import type { SseEvent } from '@/server/sse/events';
import { buildSystemPrompt } from '@/server/prompt/builder';
import { detectLang } from '@/server/text/langDetect';
import { recallForPrompt } from '@/server/memory/recall';
import { runPostTurnMemory } from '@/server/memory/postTurn';
import { maybeOfferScenario } from '@/server/scenario/offer';
import { applyMessageProgression } from '@/server/relationship/progression';
import { correctGrammar } from '@/server/correction/grammar';

const RECENT_BUFFER = 10;

export interface StreamChatDeps {
  prisma: PrismaClient;
  ollama: OllamaClient;
  userId: string;
  npcId: string;
  text: string;
  lang?: string;
}

export async function* streamChat(deps: StreamChatDeps): AsyncGenerator<SseEvent> {
  const { prisma, ollama, userId, npcId, text } = deps;

  const npc = await prisma.npc.findUnique({ where: { id: npcId } });
  if (!npc) {
    yield { event: 'error', data: { code: 'NPC_NOT_FOUND', message: npcId } };
    yield { event: 'done', data: {} };
    return;
  }

  const thread = await prisma.thread.upsert({
    where: { userId_npcId: { userId, npcId } },
    create: { userId, npcId },
    update: {},
  });
  const rel = await prisma.relationship.upsert({
    where: { userId_npcId: { userId, npcId } },
    create: { userId, npcId },
    update: {},
  });

  const lang = deps.lang ?? detectLang(text);
  const userMsg = await prisma.message.create({
    data: { threadId: thread.id, userId, role: 'user', text, langDetect: lang },
  });
  // bump lastMsgAt now so the thread reflects the user's turn even if the LLM call fails below
  await prisma.thread.update({ where: { id: thread.id }, data: { lastMsgAt: userMsg.createdAt } });
  yield { event: 'user_message_saved', data: { messageId: userMsg.id, createdAt: userMsg.createdAt } };
  yield { event: 'typing_start', data: { npcId } };

  const [profile, user, recent, recalled] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.message.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: 'desc' }, take: RECENT_BUFFER }),
    recallForPrompt({ prisma, ollama, userId, npcId, queryText: text }),
  ]);
  const history = recent.reverse();

  const systemPrompt = buildSystemPrompt({
    npc: {
      name: npc.name,
      personaPrompt: npc.personaPrompt,
      languageProfile: JSON.parse(npc.languageProfile),
    },
    userProfile: profile
      ? { role: profile.role, goal: profile.goal, interests: JSON.parse(profile.interests) }
      : undefined,
    relationshipStage: rel.stage as 'acquaintance' | 'friend' | 'close',
    userLanguage: user?.language ?? 'zh-CN',
    facts: recalled.facts,
    recentSummary: recalled.summary,
    mode: 'casual',
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m): ChatMessage => ({ role: m.userId ? 'user' : 'assistant', content: m.text })),
  ];

  let full = '';
  try {
    for await (const tok of ollama.chat(messages)) {
      full += tok;
      yield { event: 'token', data: { delta: tok } };
    }
  } catch (e) {
    yield { event: 'error', data: { code: 'LLM_UNAVAILABLE', message: String(e) } };
    yield { event: 'typing_end', data: { npcId } };
    yield { event: 'done', data: {} };
    return;
  }

  const npcMsg = await prisma.message.create({
    data: { threadId: thread.id, userId: null, role: 'npc', text: full },
  });
  yield { event: 'typing_end', data: { npcId } };
  yield { event: 'message_complete', data: { messageId: npcMsg.id, fullText: full } };

  await prisma.thread.update({ where: { id: thread.id }, data: { lastMsgAt: npcMsg.createdAt } });
  await prisma.activityEvent.create({
    data: { userId, type: 'message_sent', payload: JSON.stringify({ npcId }) },
  });
  await applyMessageProgression(prisma, userId, npcId);

  // Grammar correction — gated by settings (default on), guarded. Targets the user's message.
  try {
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (settings?.grammarCorrection !== false) {
      const correction = await correctGrammar({ ollama, userText: text, npcPrev: full });
      if (correction) {
        const payload = { fixed: correction.fixed, noteZh: correction.noteZh, tag: correction.tag };
        await prisma.message.update({ where: { id: userMsg.id }, data: { correction: JSON.stringify(payload) } });
        yield { event: 'correction', data: { targetMessageId: userMsg.id, correction: payload } };
      }
    }
  } catch (e) {
    console.error('[correction] failed', e);
  }

  await runPostTurnMemory({ prisma, ollama, userId, threadId: thread.id, userText: text, userMsgId: userMsg.id });

  // B3 trigger: offer a scenario when the relationship + topic line up. Guarded — never breaks the chat turn.
  try {
    const offer = await maybeOfferScenario({ prisma, userId, npcId, threadId: thread.id, text });
    if (offer) yield { event: 'scenario_offer', data: offer };
  } catch (e) {
    console.error('[scenario] offer failed', e);
  }

  yield { event: 'done', data: {} };
}
