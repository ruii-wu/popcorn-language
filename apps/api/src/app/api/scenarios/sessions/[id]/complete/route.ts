import { prisma } from '@/server/db/client';
import { errorJson } from '@/server/http/respond';
import { requireUser } from '@/server/auth/requireUser';
import { sseResponse, type SseEvent } from '@/server/sse/events';
import { ollamaForUser } from '@/server/llm/userClient';
import { runScenarioEnd } from '@/server/scenario/end';
import type { ScenarioState } from '@/server/scenario/state';

function parseState(raw: string): ScenarioState | null {
  try {
    const state = JSON.parse(raw) as Partial<ScenarioState>;
    if (typeof state.turnsLeft !== 'number') return null;
    return state as ScenarioState;
  } catch {
    return null;
  }
}

async function* retryCompletion(
  deps: Parameters<typeof runScenarioEnd>[0],
): AsyncGenerator<SseEvent> {
  try {
    yield* runScenarioEnd(deps);
  } catch (error) {
    console.error('[scenario] completion retry failed', error);
    yield { event: 'error', data: { code: 'END_FAILED', message: String(error) } };
  }
  yield { event: 'done', data: {} };
}

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<Response> {
  let userId: string;
  try { userId = requireUser(req).userId; } catch { return errorJson(401, 'UNAUTHORIZED', 'Sign in required'); }

  const session = await prisma.scenarioSession.findFirst({
    where: { id: params.id, userId, hiddenAt: null },
    include: { template: true, npc: true, summary: true },
  });
  if (!session) return errorJson(404, 'NOT_FOUND', 'Scenario session not found');
  if (session.status !== 'active' && session.status !== 'completed') {
    return errorJson(409, 'NOT_COMPLETABLE', `session is "${session.status}"`);
  }

  const state = parseState(session.state);
  if (session.status === 'active' && (!state || state.turnsLeft > 0)) {
    return errorJson(409, 'NOT_READY', 'Scenario still has turns remaining');
  }
  // Completed sessions re-enter only to compensate optional post-commit work
  // (currently Memory generation), so a persisted Summary is required.
  if (session.status === 'completed' && !session.summary) {
    return errorJson(409, 'SUMMARY_MISSING', 'Completed scenario has no persisted summary');
  }

  return sseResponse(retryCompletion({
    prisma,
    ollama: await ollamaForUser(prisma, userId),
    session,
    state: state ?? { impression: 5, stress: 'Medium', turnsLeft: 0, turnIndex: 0 },
  }));
}
