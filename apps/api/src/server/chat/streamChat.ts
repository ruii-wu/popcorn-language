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
import { runAchievementTick } from '@/server/achievements/engine';

const RECENT_BUFFER = 10;

export interface StreamChatDeps {
  prisma: PrismaClient;
  ollama: OllamaClient;
  userId: string;
  npcId: string;
  text: string;
  lang?: string;
}

interface CasualReplyDeps {
  prisma: PrismaClient;
  ollama: OllamaClient;
  userId: string;
  npcId: string;
  threadId: string;
  userMsgId: string;
  text: string;
}

async function* streamCasualReply(deps: CasualReplyDeps): AsyncGenerator<SseEvent> {
  const { prisma, ollama, userId, npcId, threadId, userMsgId, text } = deps;
  const npc = await prisma.npc.findUnique({ where: { id: npcId } });
  const rel = await prisma.relationship.findUnique({ where: { userId_npcId: { userId, npcId } } });
  if (!npc || !rel) {
    yield { event: 'error', data: { code: 'CHAT_CONTEXT_NOT_FOUND', message: npcId } };
    yield { event: 'done', data: {} };
    return;
  }

  yield { event: 'typing_start', data: { npcId } };

  const [profile, user, recent, recalled] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.message.findMany({ where: { threadId, scenarioSessionId: null, retractedAt: null, hiddenAt: null }, orderBy: { createdAt: 'desc' }, take: RECENT_BUFFER }),
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
  let typingActive = true;
  try {
    for await (const tok of ollama.chat(messages)) {
      if (!tok) continue;
      if (typingActive) {
        typingActive = false;
        yield { event: 'typing_end', data: { npcId } };
      }
      full += tok;
      yield { event: 'token', data: { delta: tok } };
    }
  } catch (e) {
    if (typingActive) yield { event: 'typing_end', data: { npcId } };
    yield { event: 'error', data: { code: 'LLM_UNAVAILABLE', message: String(e) } };
    yield { event: 'done', data: {} };
    return;
  }

  // Empty generations still need to close the pending typing indicator.
  if (typingActive) yield { event: 'typing_end', data: { npcId } };

  const currentUserMessage = await prisma.message.findUnique({ where: { id: userMsgId }, select: { retractedAt: true } });
  if (!currentUserMessage || currentUserMessage.retractedAt) {
    yield { event: 'done', data: {} };
    return;
  }

  const npcMsg = await prisma.message.create({
    data: { threadId, userId: null, role: 'npc', text: full },
  });
  yield { event: 'message_complete', data: { messageId: npcMsg.id, fullText: full } };

  await prisma.thread.update({ where: { id: threadId }, data: { lastMsgAt: npcMsg.createdAt } });
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
        await prisma.message.update({ where: { id: userMsgId }, data: { correction: JSON.stringify(payload) } });
        yield { event: 'correction', data: { targetMessageId: userMsgId, correction: payload } };
      }
    }
  } catch (e) {
    console.error('[correction] failed', e);
  }

  await runAchievementTick(prisma, userId);
  await runPostTurnMemory({ prisma, ollama, userId, threadId, userText: text, userMsgId, npcId });
  yield { event: 'done', data: {} };
}

// A scenario offer is decided before the normal NPC generation. If the user declines,
// the same persisted user turn is passed to this function so chat can continue without
// saving the user's message a second time.
export function streamDeferredChat(deps: CasualReplyDeps): AsyncGenerator<SseEvent> {
  return streamCasualReply(deps);
}

export async function* streamChat(deps: StreamChatDeps): AsyncGenerator<SseEvent> {
  const { prisma, userId, npcId, text } = deps;

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
  await prisma.relationship.upsert({
    where: { userId_npcId: { userId, npcId } },
    create: { userId, npcId },
    update: {},
  });

  const lang = deps.lang ?? detectLang(text);
  const userMsg = await prisma.message.create({
    data: { threadId: thread.id, userId, role: 'user', text, langDetect: lang },
  });
  await prisma.thread.update({ where: { id: thread.id }, data: { lastMsgAt: userMsg.createdAt } });
  yield { event: 'user_message_saved', data: { messageId: userMsg.id, createdAt: userMsg.createdAt } };

  // Keep the trigger turn single-purpose: show the offer immediately instead of making
  // the NPC spend a normal chat turn before the scenario invitation.
  try {
    const offer = await maybeOfferScenario({ prisma, userId, npcId, threadId: thread.id, text, userMsgId: userMsg.id });
    if (offer) {
      try {
        await prisma.activityEvent.create({
          data: { userId, type: 'message_sent', payload: JSON.stringify({ npcId }) },
        });
        await applyMessageProgression(prisma, userId, npcId);
      } catch (e) {
        console.error('[scenario] trigger-turn progression failed', e);
      }
      yield { event: 'scenario_offer', data: offer };
      yield { event: 'done', data: {} };
      return;
    }
  } catch (e) {
    console.error('[scenario] pre-chat offer failed', e);
  }

  yield* streamCasualReply({
    prisma,
    ollama: deps.ollama,
    userId,
    npcId,
    threadId: thread.id,
    userMsgId: userMsg.id,
    text,
  });
}
