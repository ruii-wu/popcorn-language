// src/server/scenario/turn.ts
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';
import type { SseEvent } from '@/server/sse/events';
import type { ZodType } from 'zod';
import { applyDelta, hardTurnLimit, type ScenarioState } from './state';
import { buildScenarioMessages } from './prompt';
import { ScenarioTurnSchema, type ScenarioTurnJson } from './schemas';
import { resolveRole } from './role';
import { runScenarioEnd } from './end';
import { choiceTextsFromJson, sanitizeScenarioChoices } from './choiceQuality';

export interface TurnDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson' | 'embed'>;
  userId: string;
  sessionId: string;
  choiceId?: string;
  tone?: string;
  text?: string;
}

function fallbackTurn(state: ScenarioState, mustConclude: boolean): ScenarioTurnJson {
  if (mustConclude) {
    return {
      npcReply: 'Thanks — that gives me what I need. We can wrap up here.',
      stateDelta: { impression: 0, stress: state.stress },
      isFinalTurn: true,
      suggestedChoicesNext: [],
    };
  }
  return {
    npcReply: '(One moment — let me follow up on that.) Could you say a bit more?',
    stateDelta: { impression: 0, stress: state.stress },
    isFinalTurn: false,
    suggestedChoicesNext: [
      { id: 'fb1', text: 'Sure — let me explain.', tone: 'Reflective', desc: '' },
      { id: 'fb2', text: 'I think I covered it.', tone: 'Confident', desc: '' },
      { id: 'fb3', text: 'Could you clarify the question?', tone: 'Diplomatic', desc: '' },
    ],
  };
}

export async function* runScenarioTurn(deps: TurnDeps): AsyncGenerator<SseEvent> {
  const { prisma, ollama, userId, sessionId } = deps;

  const session = await prisma.scenarioSession.findFirst({
    where: { id: sessionId, userId },
    include: { template: true, npc: true },
  });
  if (!session) {
    yield { event: 'error', data: { code: 'NOT_FOUND', message: 'Scenario session not found' } };
    yield { event: 'done', data: {} };
    return;
  }
  if (session.status !== 'active') {
    yield { event: 'error', data: { code: 'NOT_ACTIVE', message: `session is "${session.status}"` } };
    yield { event: 'done', data: {} };
    return;
  }

  const state = JSON.parse(session.state) as ScenarioState;
  if (state.completionPending) {
    // The final turn is already durable; only the completion tail needs retrying.
    // Never turn a summary failure into an extra learner turn.
    yield { event: 'error', data: { code: 'END_FAILED', message: 'Scenario summary needs to be retried' } };
    yield { event: 'done', data: {} };
    return;
  }
  const mustConclude = state.turnIndex + 1 >= hardTurnLimit(session.template);
  const userText = deps.text ?? deps.choiceId ?? '';

  const userMsg = await prisma.message.create({
    data: {
      threadId: session.threadId, userId, role: 'user', text: userText,
      scenarioSessionId: session.id, meta: JSON.stringify({ choiceId: deps.choiceId, tone: deps.tone }),
    },
  });
  yield { event: 'user_message_saved', data: { messageId: userMsg.id, createdAt: userMsg.createdAt } };
  yield { event: 'typing_start', data: { npcId: session.npcId } };

  const { roleName } = resolveRole(session.npc, session.template);
  const [user, history, priorTurns] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.message.findMany({
      where: { scenarioSessionId: session.id, role: { in: ['user', 'npc-roleplay'] } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.scenarioTurn.findMany({
      where: { sessionId: session.id },
      orderBy: { turnIndex: 'asc' },
      select: { nextChoices: true },
    }),
  ]);
  const previousChoiceTexts = choiceTextsFromJson(priorTurns.map((prior) => prior.nextChoices));
  const messages = buildScenarioMessages({
    roleName,
    instructions: session.template.systemPrompt,
    userLanguage: user?.language ?? 'zh-CN',
    state,
    history: history.map((m) => ({ role: m.role, text: m.text, userId: m.userId })),
    previousChoiceTexts,
    mustConclude,
  });

  let turn: ScenarioTurnJson;
  try {
    turn = await ollama.chatJson(messages, ScenarioTurnSchema as unknown as ZodType<ScenarioTurnJson>, { options: { temperature: 0.7 } });
  } catch (e) {
    console.error('[scenario] turn generation failed, using fallback', e);
    turn = fallbackTurn(state, mustConclude);
  }
  const isFinal = turn.isFinalTurn || mustConclude;
  turn.suggestedChoicesNext = isFinal
    ? []
    : sanitizeScenarioChoices(turn.suggestedChoicesNext, previousChoiceTexts, 3);

  const stateAfter: ScenarioState = {
    ...applyDelta(state, turn.stateDelta),
    completionPending: isFinal,
  };
  const npcMsg = await prisma.message.create({
    data: {
      threadId: session.threadId, userId: null, role: 'npc-roleplay', text: turn.npcReply,
      scenarioSessionId: session.id, meta: JSON.stringify({ roleplayCharacter: roleName }),
    },
  });
  await prisma.scenarioTurn.create({
    data: {
      sessionId: session.id, turnIndex: stateAfter.turnIndex,
      userChoiceId: deps.choiceId, userChoiceTone: deps.tone,
      userFreeText: deps.text && !deps.choiceId ? deps.text : null,
      userMessageId: userMsg.id, npcMessageId: npcMsg.id,
      stateBefore: JSON.stringify(state), stateAfter: JSON.stringify(stateAfter),
      nextChoices: JSON.stringify(turn.suggestedChoicesNext),
    },
  });
  await prisma.scenarioSession.update({ where: { id: session.id }, data: { state: JSON.stringify(stateAfter) } });

  yield { event: 'typing_end', data: { npcId: session.npcId } };
  yield { event: 'message_complete', data: { messageId: npcMsg.id, fullText: turn.npcReply } };
  yield { event: 'state_update', data: { impression: stateAfter.impression, stress: stateAfter.stress, turnsLeft: stateAfter.turnsLeft } };

  if (!isFinal) {
    yield { event: 'choices', data: { choices: turn.suggestedChoicesNext } };
  } else {
    try {
      yield* runScenarioEnd({ prisma, ollama, session, state: stateAfter });
    } catch (e) {
      console.error('[scenario] end flow failed', e);
      yield { event: 'error', data: { code: 'END_FAILED', message: String(e) } };
    }
  }

  yield { event: 'done', data: {} };
}
