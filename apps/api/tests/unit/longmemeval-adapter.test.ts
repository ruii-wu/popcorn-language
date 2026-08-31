import { describe, expect, it } from 'vitest';
import {
  isRetrievalInstance,
  selectStratifiedInstances,
  toEvalDataset,
  LONGMEMEVAL_CHUNK_CHARS,
  parseLongMemEvalDate,
  type LongMemEvalInstance,
} from '@/server/memory/eval/longMemEval';

function sample(id: string, type = 'single-session-user'): LongMemEvalInstance {
  return {
    question_id: id,
    question_type: type,
    question: 'Where does the user live?',
    haystack_session_ids: ['old', 'answer'],
    haystack_sessions: [
      [{ role: 'user', content: 'I like tea.' }],
      [{ role: 'user', content: 'I live in Singapore.', has_answer: true }],
    ],
    answer_session_ids: ['answer'],
  };
}

describe('LongMemEval adapter', () => {
  it('converts aligned sessions and gold evidence ids into an eval dataset', () => {
    const dataset = toEvalDataset(sample('q1'), 5);
    expect(dataset.id).toBe('longmemeval-s:q1');
    expect(dataset.corpus).toHaveLength(2);
    expect(dataset.corpus[1]).toMatchObject({ key: 'turn:answer:0:0', kind: 'summary' });
    expect(dataset.probes[0].relevantKeys).toEqual(['turn:answer:0:0']);
  });

  it('excludes abstention cases and selects question types round-robin', () => {
    const abstention = { ...sample('q_abs'), answer_session_ids: [] };
    expect(isRetrievalInstance(abstention)).toBe(false);
    const picked = selectStratifiedInstances([
      sample('b2', 'temporal'), sample('a2', 'single'), sample('b1', 'temporal'), sample('a1', 'single'), abstention,
    ], 3);
    expect(picked.map((item) => item.question_id)).toEqual(['a1', 'b1', 'a2']);
  });

  it('rejects malformed or evidence-free histories', () => {
    expect(() => toEvalDataset({ ...sample('bad'), haystack_sessions: [] }, 5)).toThrow('lengths differ');
    expect(() => toEvalDataset({ ...sample('missing'), answer_session_ids: ['unknown'] }, 5)).toThrow(
      'no answer session',
    );
  });

  it('chunks unusually long turns before embedding', () => {
    const input = sample('long');
    input.haystack_sessions[1][0].content = 'answer '.repeat(2_000);
    const dataset = toEvalDataset(input, 5);
    expect(dataset.corpus.length).toBeGreaterThan(2);
    expect(dataset.corpus.every((item) => item.kind !== 'summary' || item.summary.length <= LONGMEMEVAL_CHUNK_CHARS)).toBe(true);
  });

  it('normalizes benchmark timestamps for deterministic recency scoring', () => {
    expect(parseLongMemEvalDate('2023/08/11 (Fri) 15:58')).toBe('2023-08-11T15:58:00.000Z');
    const input = sample('dated');
    input.haystack_dates = ['2023/08/11 (Fri) 15:58', '2023/08/18 (Fri) 11:15'];
    input.question_date = '2023/08/19 (Sat) 12:00';
    const dataset = toEvalDataset(input, 5);
    expect(dataset.corpus[0].createdAt).toBe('2023-08-11T15:58:00.000Z');
    expect(dataset.evaluationTime).toBe('2023-08-19T12:00:00.000Z');
  });
});
