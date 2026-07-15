// src/server/scenario/offer.ts
import type { PrismaClient } from '@prisma/client';
import { judgeScenarioTrigger } from './trigger';
import { buildInvitationDraft, invitationText, type InvitationDraft } from './invitation';

export interface OfferDeps {
  prisma: PrismaClient;
  userId: string;
  npcId: string;
  threadId: string;
  text: string;
  userMsgId?: string;
}

export interface ScenarioOffer {
  sessionId: string;
  draft: InvitationDraft;
}

// Called by streamChat after the reply (guarded). Deterministic, no LLM.
export async function maybeOfferScenario(deps: OfferDeps): Promise<ScenarioOffer | null> {
  const hit = await judgeScenarioTrigger(deps);
  if (!hit) return null;

  const draft = buildInvitationDraft(hit.template, hit.rationale);
  const session = await deps.prisma.scenarioSession.create({
    data: {
      userId: deps.userId,
      npcId: deps.npcId,
      threadId: deps.threadId,
      templateId: hit.template.id,
      status: 'invited',
      triggerRationale: JSON.stringify({
        ...hit.rationale,
        deferredText: deps.text,
        ...(deps.userMsgId ? { deferredMessageId: deps.userMsgId } : {}),
      }),
    },
  });
  await deps.prisma.message.create({
    data: {
      threadId: deps.threadId,
      userId: null,
      role: 'invitation',
      text: invitationText(hit.template),
      scenarioSessionId: session.id,
      meta: JSON.stringify({ invitationSessionId: session.id }),
    },
  });
  return { sessionId: session.id, draft };
}
