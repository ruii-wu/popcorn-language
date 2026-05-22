// Integration: take the actual seed-data NPCs/templates and run them through
// PromptBuilder, validating that the assembled prompts are coherent end-to-end.
// No DB / Ollama required.

import { describe, expect, it } from 'vitest';
import { NPCS, SCENARIO_TEMPLATES } from '../../prisma/seed-data';
import {
  buildSystemPrompt,
  buildScenarioMessages,
  type NpcInput,
  type RelationshipInput,
  type UserProfileInput,
} from '@/lib/llm/prompt-builder';

function asInput(npc: typeof NPCS[number]): NpcInput {
  return {
    id: npc.id,
    name: npc.name,
    shortBio: npc.shortBio,
    personaPrompt: npc.personaPrompt,
    languageProfile: npc.languageProfile as any,
    topicInterests: [...npc.topicInterests],
    scenarioRoles: npc.scenarioRoles.map((r) => ({
      id: r.id,
      name: r.name,
      voice: r.voice,
      defaultStress: r.defaultStress as 'Low' | 'Medium' | 'High',
      backstory: r.backstory,
    })),
  };
}

const USER: UserProfileInput = {
  displayName: 'Rui',
  language: 'zh-CN',
  targetLang: 'en-US',
  cefrLevel: 'B1',
  role: 'Software engineer',
  goal: 'work',
  interests: ['Coffee', 'Cats', 'Tech'],
};

const FRIEND: RelationshipInput = {
  stage: 'friend',
  stageValue: 2,
  conversationCount: 8,
  scenarioCount: 1,
};

describe('integration · seed NPC → casual system prompt', () => {
  for (const npc of NPCS) {
    it(`assembles a coherent prompt for ${npc.name}`, () => {
      const p = buildSystemPrompt({
        npc: asInput(npc),
        user: USER,
        relationship: FRIEND,
        mode: 'casual',
      });
      // Contains persona's opening line
      expect(p.split('\n')[0]).toBe(npc.personaPrompt.split('\n')[0]);
      // All required block headers present
      expect(p).toContain('## LANGUAGE CONTEXT');
      expect(p).toContain('## ABOUT THE USER');
      expect(p).toContain('## RELATIONSHIP');
      expect(p).toContain('CURRENT MODE: CASUAL CHAT');
      // Sanity: prompt isn't unreasonably long (rough token budget)
      expect(p.length).toBeLessThan(5_000);
      expect(p.length).toBeGreaterThan(500);
    });
  }
});

describe('integration · mock_interview scenario → roleplay messages', () => {
  it('builds a scenario message payload with role + JSON contract embedded', () => {
    const tpl = SCENARIO_TEMPLATES.find((t) => t.id === 'mock_interview')!;
    const lily = asInput(NPCS.find((n) => n.id === 'lily')!);

    const msgs = buildScenarioMessages({
      npc: lily,
      user: USER,
      relationship: FRIEND,
      scenarioRoleId: tpl.rolePlayedBy,
      scenarioSystemPrompt: tpl.systemPrompt,
      scenarioState: { impression: 5, stress: 'Medium', turnsLeft: tpl.estimatedTurns },
      recent: [
        { role: 'assistant', text: 'Thanks for coming in. Walk me through your last project.' },
        { role: 'user',      text: 'I led the redesign of our onboarding flow last quarter.' },
      ],
    });

    expect(msgs[0]?.role).toBe('system');
    const system = msgs[0]!.content;
    // Both NPC persona and the scenario role survive in the system prompt
    expect(system).toContain('You are Lily');
    expect(system).toContain('"Linda"');
    // JSON contract is present
    expect(system).toContain('npcReply');
    expect(system).toContain('stateDelta');
    expect(system).toContain('nextChoices');
    // State injected
    expect(system).toContain('"turnsLeft":6');

    // Recent buffer is appended in order with mapped roles
    expect(msgs).toHaveLength(3);
    expect(msgs[1]?.role).toBe('assistant');
    expect(msgs[2]?.role).toBe('user');
  });

  it('refuses a scenario role that does not exist on the NPC', () => {
    const lily = asInput(NPCS.find((n) => n.id === 'lily')!);
    expect(() =>
      buildScenarioMessages({
        npc: lily,
        user: USER,
        relationship: FRIEND,
        scenarioRoleId: 'nonexistent_role',
        scenarioSystemPrompt: 'x',
        scenarioState: {},
        recent: [],
      }),
    ).toThrow(/not found on NPC lily/);
  });
});
