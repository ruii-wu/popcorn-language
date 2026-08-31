// tests/unit/scenario-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildScenarioSystem, buildScenarioMessages } from '@/server/scenario/prompt';

const state = { impression: 5, stress: 'Medium' as const, turnsLeft: 4, turnIndex: 1 };

describe('scenario prompt', () => {
  it('system prompt carries role, state line, and the JSON contract', () => {
    const s = buildScenarioSystem({
      roleName: 'Linda', instructions: 'You are an HR manager.', userLanguage: 'zh-CN', state,
      previousChoiceTexts: ['I led a university campaign.'],
    });
    expect(s).toContain('Linda');
    expect(s).toContain('suggestedTurnsLeft: 4');
    expect(s).toContain('not a forced countdown');
    expect(s).toContain('"isFinalTurn"');
    expect(s).toContain('native Chinese');
    expect(s).toContain('directly answers the specific final question');
    expect(s).toContain('I led a university campaign.');
  });

  it('opening run appends a greeting nudge; turn run does not', () => {
    const opening = buildScenarioMessages({
      roleName: 'Linda', instructions: 'x', userLanguage: 'en-US', state, history: [], opening: true,
    });
    expect(opening[0].role).toBe('system');
    expect(opening[opening.length - 1].role).toBe('user');
    expect(opening[opening.length - 1].content).toContain('sat down');

    const turn = buildScenarioMessages({
      roleName: 'Linda', instructions: 'x', userLanguage: 'en-US', state,
      history: [{ role: 'user', text: 'Hi', userId: 'u1' }, { role: 'npc-roleplay', text: 'Welcome.', userId: null }],
    });
    expect(turn.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(turn[turn.length - 1].role).toBe('assistant');
  });

  it('requires a closing response only at the hard safety limit', () => {
    const prompt = buildScenarioSystem({
      roleName: 'Linda', instructions: 'x', userLanguage: 'en-US', state, mustConclude: true,
    });
    expect(prompt).toContain('final safety-limit exchange');
    expect(prompt).toContain('do not ask another question');
  });
});
