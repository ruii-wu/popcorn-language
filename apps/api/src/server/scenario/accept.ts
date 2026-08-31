// src/server/scenario/accept.ts
import type { PrismaClient } from '@prisma/client';
import type { OllamaClient } from '@/server/llm/ollama';
import type { ZodType } from 'zod';
import { canTransition } from './transitions';
import { initState, type ScenarioState } from './state';
import { buildScenarioMessages } from './prompt';
import { ScenarioTurnSchema, type ScenarioTurnJson } from './schemas';
import { resolveRole } from './role';
import { mapSessionDetail, type SessionDetail } from './sessionView';
import { sanitizeScenarioChoices } from './choiceQuality';

export class ScenarioError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'ScenarioError'; }
}

export interface AcceptDeps {
  prisma: PrismaClient;
  ollama: Pick<OllamaClient, 'chatJson'>;
  userId: string;
  sessionId: string;
}

export interface AcceptResult {
  session: SessionDetail['session'];
  openingMessage: { id: string; text: string };
  choices: ScenarioTurnJson['suggestedChoicesNext'];
  state: ScenarioState;
}

export async function acceptScenario(deps: AcceptDeps): Promise<AcceptResult> {
  const { prisma, ollama, userId, sessionId } = deps;

  const session = await prisma.scenarioSession.findFirst({
    where: { id: sessionId, userId },
    include: { template: true, npc: true },
  });
  if (!session) throw new ScenarioError('NOT_FOUND', 'Scenario session not found');
  if (!canTransition(session.status, 'active')) {
    throw new ScenarioError('CONFLICT', `cannot accept a session in status "${session.status}"`);
  }

  const { roleName, defaultStress } = resolveRole(session.npc, session.template);
  const state = initState(session.template, { defaultStress });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const messages = buildScenarioMessages({
    roleName,
    instructions: session.template.systemPrompt,
    userLanguage: user?.language ?? 'zh-CN',
    state,
    history: [],
    opening: true,
  });

  let turn: ScenarioTurnJson;
  try {
    turn = await ollama.chatJson(messages, ScenarioTurnSchema as unknown as ZodType<ScenarioTurnJson>, { options: { temperature: 0.7 } });
  } catch (e) {
    console.error('[scenario] opening generation failed, using fallback', e);
    turn = {
      npcReply: `Thanks for coming in. Let's begin — could you tell me a little about yourself?`,
      stateDelta: { impression: 0, stress: state.stress },
      isFinalTurn: false,
      suggestedChoicesNext: [],
    };
  }
  // Accept always creates the opening exchange; completion is only valid after a learner turn.
  turn.isFinalTurn = false;
  turn.suggestedChoicesNext = sanitizeScenarioChoices(turn.suggestedChoicesNext, [], 3);

  const npcMsg = await prisma.message.create({
    data: {
      threadId: session.threadId, userId: null, role: 'npc-roleplay', text: turn.npcReply,
      scenarioSessionId: session.id, meta: JSON.stringify({ roleplayCharacter: roleName }),
    },
  });
  await prisma.scenarioTurn.create({
    data: {
      sessionId: session.id, turnIndex: 0, npcMessageId: npcMsg.id,
      stateBefore: '{}', stateAfter: JSON.stringify(state),
      nextChoices: JSON.stringify(turn.suggestedChoicesNext),
    },
  });
  await prisma.scenarioSession.update({
    where: { id: session.id },
    data: { status: 'active', startedAt: new Date(), state: JSON.stringify(state) },
  });
  await prisma.activityEvent.create({
    data: { userId, type: 'scenario_accepted', payload: JSON.stringify({ sessionId: session.id, templateId: session.templateId }) },
  });

  const fresh = await prisma.scenarioSession.findUniqueOrThrow({
    where: { id: session.id }, include: { template: true, summary: true },
  });
  const detail = mapSessionDetail(fresh, []);
  return {
    session: detail.session,
    openingMessage: { id: npcMsg.id, text: turn.npcReply },
    choices: turn.suggestedChoicesNext,
    state,
  };
}
