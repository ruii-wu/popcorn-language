import { describe, expect, it } from 'vitest';
import {
  buildSystemPrompt,
  buildMessages,
  buildScenarioMessages,
  userMessage,
  type NpcInput,
  type UserProfileInput,
  type RelationshipInput,
  type MemoryFactInput,
} from '@/lib/llm/prompt-builder';

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const LILY: NpcInput = {
  id: 'lily',
  name: 'Lily',
  shortBio: 'Brooklyn barista',
  personaPrompt: 'You are Lily, a 24-year-old barista in Brooklyn.',
  languageProfile: {
    primary: 'en',
    occasional: ['zh'],
    register: 'casual',
    codeSwitchTolerance: 'high',
  },
  topicInterests: ['coffee', 'cats'],
  scenarioRoles: [
    { id: 'hr_manager', name: 'Linda', voice: 'professional', defaultStress: 'Medium' },
  ],
};

const CHEN: NpcInput = {
  id: 'chen',
  name: 'Mr. Chen',
  shortBio: 'Bilingual senior coworker',
  personaPrompt: 'You are Mr. Chen.',
  languageProfile: {
    primary: 'en',
    occasional: ['zh'],
    register: 'professional',
    codeSwitchTolerance: 'native',
    preferredPattern: 'bilingual-mirror',
  },
  topicInterests: ['work'],
  scenarioRoles: [],
};

const EMMA: NpcInput = {
  id: 'emma',
  name: 'Emma',
  shortBio: 'UK uni student',
  personaPrompt: 'You are Emma, 21, Manchester.',
  languageProfile: {
    primary: 'en',
    occasional: [],
    register: 'casual-energetic',
    codeSwitchTolerance: 'none-but-curious',
  },
  topicInterests: ['cats'],
  scenarioRoles: [],
};

const USER_FULL: UserProfileInput = {
  displayName: 'Rui',
  language: 'zh-CN',
  targetLang: 'en-US',
  cefrLevel: 'B1',
  role: 'Software engineer',
  goal: 'work',
  interests: ['Coffee', 'Cats', 'Tech'],
};

const USER_MIN: UserProfileInput = {
  language: 'zh-CN',
  targetLang: 'en-US',
};

const REL_FRIEND: RelationshipInput = {
  stage: 'friend',
  stageValue: 2,
  conversationCount: 8,
  scenarioCount: 1,
};

// ----------------------------------------------------------------------------
// buildSystemPrompt
// ----------------------------------------------------------------------------

describe('buildSystemPrompt', () => {
  it('starts with persona block verbatim', () => {
    const prompt = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND });
    expect(prompt.startsWith('You are Lily, a 24-year-old barista in Brooklyn.')).toBe(true);
  });

  describe('language block', () => {
    it('mentions user native and target language', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND });
      expect(p).toContain("The user's native language is Chinese");
      expect(p).toContain('practising English');
    });

    it('includes bilingual-mirror instruction for Mr. Chen', () => {
      const p = buildSystemPrompt({ npc: CHEN, user: USER_FULL, relationship: REL_FRIEND });
      expect(p).toContain('bilingual mirror pattern');
    });

    it('does NOT include bilingual-mirror for Lily', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND });
      expect(p).not.toContain('bilingual mirror pattern');
    });

    it('emits curious-monolingual hint for Emma', () => {
      const p = buildSystemPrompt({ npc: EMMA, user: USER_FULL, relationship: REL_FRIEND });
      expect(p).toContain('ask them what it means');
    });

    it('emits code-switch welcome for Lily (high tolerance)', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND });
      expect(p).toContain('Code-switching from the user is welcome');
    });

    it('adds CEFR level note when present', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND });
      expect(p).toContain('CEFR level is B1');
    });

    it('omits CEFR line when user has no level set', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_MIN, relationship: REL_FRIEND });
      expect(p).not.toContain('CEFR');
    });
  });

  describe('user block', () => {
    it('includes role, goal, interests when present', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND });
      expect(p).toContain('Software engineer');
      expect(p).toContain('Learning English for: work');
      expect(p).toContain('Coffee, Cats, Tech');
      expect(p).toContain('Name they go by: Rui');
    });

    it('omits the entire ABOUT THE USER block when profile is empty', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_MIN, relationship: REL_FRIEND });
      expect(p).not.toContain('## ABOUT THE USER');
    });
  });

  describe('relationship block', () => {
    it('uses acquaintance hint for stage acquaintance', () => {
      const rel: RelationshipInput = { stage: 'acquaintance', stageValue: 1, conversationCount: 1, scenarioCount: 0 };
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: rel });
      expect(p).toContain('barely know each other');
      expect(p).toContain('level 1/3');
    });

    it('uses friend hint for stage friend', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND });
      expect(p).toContain('chatted enough to feel comfortable');
      expect(p).toContain('level 2/3');
    });

    it('uses close hint for stage close', () => {
      const rel: RelationshipInput = { stage: 'close', stageValue: 3, conversationCount: 30, scenarioCount: 4 };
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: rel });
      expect(p).toContain('close friends');
      expect(p).toContain('level 3/3');
    });

    it('reports conversation and scenario counts', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND });
      expect(p).toContain('8 conversations · 1 scenarios');
    });
  });

  describe('facts block', () => {
    it('omits block when no facts', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND });
      expect(p).not.toContain('REMEMBERS');
    });

    it('lists facts sorted by confidence descending', () => {
      const facts: MemoryFactInput[] = [
        { predicate: 'has_pet', value: 'cat',         confidence: 0.6 },
        { predicate: 'lives_near', value: "Murray's", confidence: 0.95 },
        { predicate: 'studies_for', value: 'GRE',     confidence: 0.8 },
      ];
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND, facts });
      const livesIdx = p.indexOf("lives near: Murray's");
      const studiesIdx = p.indexOf('studies for: GRE');
      const petIdx = p.indexOf('has pet: cat');
      expect(livesIdx).toBeGreaterThan(-1);
      expect(studiesIdx).toBeGreaterThan(livesIdx);
      expect(petIdx).toBeGreaterThan(studiesIdx);
    });

    it('caps at 12 facts to keep prompt lean', () => {
      const facts: MemoryFactInput[] = Array.from({ length: 20 }, (_, i) => ({
        predicate: 'predicate_' + i,
        value: 'value_' + i,
        confidence: (i + 1) / 21,
      }));
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND, facts });
      const matches = p.match(/predicate_/g);
      expect(matches?.length).toBe(12);
    });

    it('uses uppercased NPC name in heading', () => {
      const facts: MemoryFactInput[] = [{ predicate: 'has_pet', value: 'cat', confidence: 0.9 }];
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND, facts });
      expect(p).toContain('## WHAT LILY REMEMBERS ABOUT THE USER');
    });
  });

  describe('summary block', () => {
    it('omits when no summary', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND });
      expect(p).not.toContain('## STORY SO FAR');
    });

    it('includes when summary is non-empty', () => {
      const p = buildSystemPrompt({
        npc: LILY, user: USER_FULL, relationship: REL_FRIEND,
        summary: 'They first met when the user wandered in looking for an oat latte.',
      });
      expect(p).toContain('## STORY SO FAR');
      expect(p).toContain('oat latte');
    });

    it('omits when summary is whitespace only', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND, summary: '   \n  ' });
      expect(p).not.toContain('## STORY SO FAR');
    });
  });

  describe('mode block', () => {
    it('casual mode forbids JSON output', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND, mode: 'casual' });
      expect(p).toContain('CURRENT MODE: CASUAL CHAT');
      expect(p).toContain('Do NOT produce JSON');
    });

    it('scenario mode requires role + state + template prompt', () => {
      const p = buildSystemPrompt({
        npc: LILY, user: USER_FULL, relationship: REL_FRIEND,
        mode: 'scenario',
        scenarioRoleId: 'hr_manager',
        scenarioSystemPrompt: 'Stay in character. Return ONLY JSON.',
        scenarioState: { impression: 6, stress: 'Medium', turnsLeft: 5 },
      });
      expect(p).toContain('CURRENT MODE: SCENARIO ROLEPLAY');
      expect(p).toContain('"Linda"');
      expect(p).toContain('"impression":6');
      expect(p).toContain('Return ONLY JSON');
    });

    it('correction mode is JSON-only and silent layer', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND, mode: 'correction' });
      expect(p).toContain('GRAMMAR CORRECTION');
      expect(p).toContain('Output JSON only');
    });

    it('summary mode requests plain text narrative', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND, mode: 'summary' });
      expect(p).toContain('CURRENT MODE: SUMMARIZATION');
      expect(p).toContain('Output plain text');
    });

    it('memory-extract mode demands JSON', () => {
      const p = buildSystemPrompt({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND, mode: 'memory-extract' });
      expect(p).toContain('FACT EXTRACTION');
    });
  });
});

// ----------------------------------------------------------------------------
// buildMessages
// ----------------------------------------------------------------------------

describe('buildMessages', () => {
  it('first message is system prompt', () => {
    const msgs = buildMessages({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND });
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[0]?.content).toContain('Lily');
  });

  it('appends recent buffer in order, mapping roles', () => {
    const recent = [
      { role: 'user' as const, text: 'hi' },
      { role: 'assistant' as const, text: 'hey!' },
      { role: 'user' as const, text: 'how are you' },
    ];
    const msgs = buildMessages({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND, recent });
    expect(msgs).toHaveLength(4);
    expect(msgs[1]).toEqual({ role: 'user', content: 'hi' });
    expect(msgs[2]).toEqual({ role: 'assistant', content: 'hey!' });
    expect(msgs[3]).toEqual({ role: 'user', content: 'how are you' });
  });

  it('caps recent buffer to default 10 pairs (20 messages)', () => {
    const recent = Array.from({ length: 60 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      text: 'msg_' + i,
    }));
    const msgs = buildMessages({ npc: LILY, user: USER_FULL, relationship: REL_FRIEND, recent });
    // system + 20 recent
    expect(msgs).toHaveLength(21);
    // Should keep the LAST 20 (msg_40 .. msg_59)
    expect(msgs[1]?.content).toBe('msg_40');
    expect(msgs[20]?.content).toBe('msg_59');
  });

  it('respects custom recentBufferLimit', () => {
    const recent = Array.from({ length: 10 }, (_, i) => ({
      role: 'user' as const,
      text: 'm' + i,
    }));
    const msgs = buildMessages({
      npc: LILY, user: USER_FULL, relationship: REL_FRIEND, recent,
      recentBufferLimit: 2, // 2 pairs = 4 messages
    });
    expect(msgs).toHaveLength(5);
    expect(msgs[1]?.content).toBe('m6');
  });
});

// ----------------------------------------------------------------------------
// buildScenarioMessages
// ----------------------------------------------------------------------------

describe('buildScenarioMessages', () => {
  it('throws if role id is not on the NPC', () => {
    expect(() =>
      buildScenarioMessages({
        npc: LILY, user: USER_FULL, relationship: REL_FRIEND,
        scenarioRoleId: 'nope', scenarioSystemPrompt: 'x', scenarioState: {}, recent: [],
      }),
    ).toThrow(/not found on NPC/);
  });

  it('includes scenario template prompt and state in system message', () => {
    const msgs = buildScenarioMessages({
      npc: LILY, user: USER_FULL, relationship: REL_FRIEND,
      scenarioRoleId: 'hr_manager',
      scenarioSystemPrompt: 'Return JSON: { npcReply, stateDelta, ... }',
      scenarioState: { impression: 6, stress: 'Medium', turnsLeft: 5 },
      recent: [{ role: 'user', text: 'walk me through your project' }],
    });
    expect(msgs[0]?.role).toBe('system');
    expect(msgs[0]?.content).toContain('SCENARIO ROLEPLAY');
    expect(msgs[0]?.content).toContain('"Linda"');
    expect(msgs[0]?.content).toContain('"turnsLeft":5');
    expect(msgs[0]?.content).toContain('Return JSON: { npcReply, stateDelta, ... }');
    expect(msgs[1]).toEqual({ role: 'user', content: 'walk me through your project' });
  });
});

// ----------------------------------------------------------------------------
// userMessage helper
// ----------------------------------------------------------------------------

describe('userMessage', () => {
  it('wraps text into a ChatMessage', () => {
    expect(userMessage('hello')).toEqual({ role: 'user', content: 'hello' });
  });
});
