import type { EvalDataset } from './dataset';

export interface LongMemEvalTurn {
  role: string;
  content: string;
  has_answer?: boolean;
}

export interface LongMemEvalInstance {
  question_id: string;
  question_type: string;
  question: string;
  question_date?: string;
  haystack_session_ids: Array<string | number>;
  haystack_dates?: string[];
  haystack_sessions: LongMemEvalTurn[][];
  answer_session_ids: Array<string | number>;
}

export const LONGMEMEVAL_CHUNK_CHARS = 2_000;

export function parseLongMemEvalDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/ \([A-Za-z]{3}\)/, '').replaceAll('/', '-').replace(' ', 'T');
  const parsed = new Date(`${normalized}:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function isRetrievalInstance(instance: LongMemEvalInstance): boolean {
  return !instance.question_id.endsWith('_abs') && instance.answer_session_ids.length > 0;
}

export function toEvalDataset(instance: LongMemEvalInstance, k: number): EvalDataset {
  if (instance.haystack_session_ids.length !== instance.haystack_sessions.length) {
    throw new Error(`LongMemEval ${instance.question_id}: session id/content lengths differ`);
  }
  if (instance.haystack_dates && instance.haystack_dates.length !== instance.haystack_sessions.length) {
    throw new Error(`LongMemEval ${instance.question_id}: session date/content lengths differ`);
  }

  const answerSessions = new Set(instance.answer_session_ids.map(String));
  const relevantKeys: string[] = [];
  const fallbackKeys: string[] = [];
  const corpus = instance.haystack_sessions.flatMap((session, sessionIndex) => {
    const sessionId = String(instance.haystack_session_ids[sessionIndex]);
    const createdAt = parseLongMemEvalDate(instance.haystack_dates?.[sessionIndex]);
    return session.flatMap((turn, turnIndex) => {
      const text = `${turn.role}: ${turn.content}`;
      const chunks = Array.from({ length: Math.max(1, Math.ceil(text.length / LONGMEMEVAL_CHUNK_CHARS)) }, (_, i) =>
        text.slice(i * LONGMEMEVAL_CHUNK_CHARS, (i + 1) * LONGMEMEVAL_CHUNK_CHARS));
      return chunks.map((summary, chunkIndex) => {
        const key = `turn:${sessionId}:${turnIndex}:${chunkIndex}`;
        if (answerSessions.has(sessionId)) {
          fallbackKeys.push(key);
          if (turn.has_answer) relevantKeys.push(key);
        }
        return { key, kind: 'summary' as const, summary, createdAt };
      });
    });
  });

  // Older LongMemEval exports occasionally omit turn labels. In that case, retain the official
  // answer-session supervision and treat every turn in the evidence session as potentially useful.
  if (relevantKeys.length === 0) relevantKeys.push(...fallbackKeys);

  if (relevantKeys.length === 0) {
    throw new Error(`LongMemEval ${instance.question_id}: no answer session appears in the haystack`);
  }

  return {
    id: `longmemeval-s:${instance.question_id}`,
    defaultK: k,
    description: `LongMemEval-S turn/chunk-level retrieval case (${instance.question_type}).`,
    evaluationTime: parseLongMemEvalDate(instance.question_date),
    corpus,
    probes: [{ queryText: instance.question, relevantKeys }],
  };
}

export function selectStratifiedInstances(
  instances: LongMemEvalInstance[],
  limit: number,
): LongMemEvalInstance[] {
  const groups = new Map<string, LongMemEvalInstance[]>();
  for (const instance of instances.filter(isRetrievalInstance)) {
    const group = groups.get(instance.question_type) ?? [];
    group.push(instance);
    groups.set(instance.question_type, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.question_id.localeCompare(b.question_id));
  }

  const types = [...groups.keys()].sort();
  const selected: LongMemEvalInstance[] = [];
  for (let round = 0; selected.length < limit; round++) {
    let added = false;
    for (const type of types) {
      const item = groups.get(type)?.[round];
      if (!item) continue;
      selected.push(item);
      added = true;
      if (selected.length === limit) break;
    }
    if (!added) break;
  }
  return selected;
}
