import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/server/prompt/builder';
import type { PromptContext } from '@/server/prompt/types';

const base: PromptContext = {
  npc: { name: 'Lily', personaPrompt: 'You are Lily, a Brooklyn barista.', languageProfile: { primary: 'en', occasional: ['zh'], register: 'casual' } },
  userLanguage: 'zh-CN',
  mode: 'casual',
};

describe('buildSystemPrompt', () => {
  it('includes persona, language profile and the bilingual learner note', () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain('You are Lily, a Brooklyn barista.');
    expect(p).toContain('primarily in en');
    expect(p).toContain('native Chinese speaker');
  });

  it('includes recalled facts, profile and relationship tone when provided', () => {
    const p = buildSystemPrompt({
      ...base,
      userProfile: { role: 'Student', goal: 'work', interests: ['Coffee', 'Cats'] },
      facts: ['orders oat milk latte', 'has a cat'],
      relationshipStage: 'close',
      recentSummary: 'Talked about the GRE.',
    });
    expect(p).toContain('role: Student');
    expect(p).toContain('orders oat milk latte');
    expect(p).toContain('Talked about the GRE.');
    expect(p).toContain('close friends');
  });

  it('adds the roleplay JSON contract in scenario mode', () => {
    const p = buildSystemPrompt({ ...base, mode: 'scenario', scenario: { roleName: 'Linda', instructions: 'Act as a tough HR manager.' } });
    expect(p).toContain('Linda');
    expect(p).toContain('"npcReply"');
    expect(p).toContain('"isFinalTurn"');
  });

  it('omits the bilingual note for an English-native user', () => {
    const p = buildSystemPrompt({ ...base, userLanguage: 'en-US' });
    expect(p).not.toContain('native Chinese speaker');
  });
});
