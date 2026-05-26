// tests/unit/scenario-invitation.test.ts
import { describe, it, expect } from 'vitest';
import { buildInvitationDraft, invitationText } from '@/server/scenario/invitation';

const template = {
  id: 'mock_interview', title: 'Mock Interview', titleZh: '模拟面试',
  estimatedMinutes: 8, registerTags: JSON.stringify(['Formal register']),
};

describe('invitation', () => {
  it('builds a draft from template metadata + rationale', () => {
    const d = buildInvitationDraft(template, { topicMatch: 'interview', turnCount: 4, stage: 'friend' });
    expect(d.title).toBe('Mock Interview');
    expect(d.estMinutes).toBe(8);
    expect(d.rationale).toContain('interview');
    expect(d.detail.length).toBeGreaterThan(0);
  });

  it('writes NPC-voice invitation copy that names the scenario and duration', () => {
    const text = invitationText(template);
    expect(text).toContain('Mock Interview');
    expect(text).toContain('8');
  });
});
