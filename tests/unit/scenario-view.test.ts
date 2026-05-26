// tests/unit/scenario-view.test.ts
import { describe, it, expect } from 'vitest';
import { mapSessionListItem, mapSessionDetail } from '@/server/scenario/sessionView';

const base = {
  id: 's1', npcId: 'lily', status: 'completed', state: JSON.stringify({ impression: 8, stress: 'Low', turnsLeft: 0, turnIndex: 6 }),
  invitedAt: new Date('2026-05-01'), startedAt: new Date('2026-05-02'), endedAt: new Date('2026-05-03'),
  triggerRationale: JSON.stringify({ topicMatch: 'interview' }),
  template: { id: 'mock_interview', title: 'Mock Interview', titleZh: '模拟面试' },
  summary: { grade: 'A' },
};

describe('scenario view mappers', () => {
  it('maps a list item with title + grade', () => {
    expect(mapSessionListItem(base)).toEqual({
      id: 's1', scenarioTitle: 'Mock Interview', npcId: 'lily', status: 'completed', grade: 'A', startedAt: base.startedAt,
    });
  });

  it('maps a detail with parsed state + transcript', () => {
    const d = mapSessionDetail({ ...base, summary: null }, [
      { id: 'm1', role: 'npc-roleplay', text: 'Why this role?', userId: null, meta: null, createdAt: base.startedAt },
      { id: 'm2', role: 'user', text: 'I value the mission.', userId: 'u1', meta: JSON.stringify({ choiceId: 'c1' }), createdAt: base.endedAt },
    ]);
    expect(d.state).toEqual({ impression: 8, stress: 'Low', turnsLeft: 0, turnIndex: 6 });
    expect(d.session.grade).toBeNull();
    expect(d.transcript).toHaveLength(2);
    expect(d.transcript[0].from).toBe('npc');
    expect(d.transcript[1].meta).toEqual({ choiceId: 'c1' });
  });
});
