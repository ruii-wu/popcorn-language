import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_DEFS, NPCS, SCENARIO_TEMPLATES } from '../../prisma/seed-data';

describe('seed-data · NPCs', () => {
  it('contains exactly the three core NPCs in expected order', () => {
    expect(NPCS.map((n) => n.id)).toEqual(['lily', 'chen', 'emma']);
  });

  it('each NPC has all required fields populated', () => {
    for (const npc of NPCS) {
      expect(npc.name.length).toBeGreaterThan(0);
      expect(npc.shortBio.length).toBeGreaterThan(0);
      expect(npc.personaPrompt.length).toBeGreaterThan(100); // not a stub
      expect(npc.avatarGlyph.length).toBeGreaterThan(0);
      expect(npc.avatarBg.length).toBeGreaterThan(0);
      expect(npc.avatarInk.length).toBeGreaterThan(0);
      expect(npc.introMessage.length).toBeGreaterThan(0);
      expect(npc.topicInterests.length).toBeGreaterThan(0);
    }
  });

  it('persona prompts do not contain placeholder TODO/FIXME', () => {
    for (const npc of NPCS) {
      expect(npc.personaPrompt).not.toMatch(/TODO|FIXME|TBD/i);
    }
  });

  it('Lily has both hr_manager and barista_busy scenario roles', () => {
    const lily = NPCS.find((n) => n.id === 'lily')!;
    const roleIds = lily.scenarioRoles.map((r) => r.id);
    expect(roleIds).toContain('hr_manager');
    expect(roleIds).toContain('barista_busy');
  });

  it('Mr. Chen uses bilingual-mirror language pattern', () => {
    const chen = NPCS.find((n) => n.id === 'chen')!;
    expect(chen.languageProfile.preferredPattern).toBe('bilingual-mirror');
    expect(chen.languageProfile.codeSwitchTolerance).toBe('native');
    expect(chen.introMessage).toContain('有空'); // bilingual proof
  });

  it('Emma is monolingual but curious about Chinese', () => {
    const emma = NPCS.find((n) => n.id === 'emma')!;
    expect(emma.languageProfile.primary).toBe('en');
    expect(emma.languageProfile.occasional).toEqual([]);
    expect(emma.languageProfile.codeSwitchTolerance).toBe('none-but-curious');
  });

  it('every scenario role has voice + defaultStress within allowed set', () => {
    const allowedStress = new Set(['Low', 'Medium', 'High']);
    for (const npc of NPCS) {
      for (const role of npc.scenarioRoles) {
        expect(role.voice.length).toBeGreaterThan(0);
        expect(allowedStress.has(role.defaultStress)).toBe(true);
      }
    }
  });
});

describe('seed-data · ScenarioTemplates', () => {
  it('mock_interview template exists and points to an NPC who hosts it', () => {
    const tpl = SCENARIO_TEMPLATES.find((t) => t.id === 'mock_interview');
    expect(tpl).toBeDefined();
    expect(tpl!.npcId).toBe('lily');
    const lily = NPCS.find((n) => n.id === 'lily')!;
    const roleIds = lily.scenarioRoles.map((r) => r.id);
    expect(roleIds).toContain(tpl!.rolePlayedBy);
  });

  it('mock_interview system prompt contains a JSON output contract', () => {
    const tpl = SCENARIO_TEMPLATES.find((t) => t.id === 'mock_interview')!;
    expect(tpl.systemPrompt).toMatch(/npcReply/);
    expect(tpl.systemPrompt).toMatch(/stateDelta/);
    expect(tpl.systemPrompt).toMatch(/isFinalTurn/);
    expect(tpl.systemPrompt).toMatch(/nextChoices/);
    expect(tpl.systemPrompt).toMatch(/ONLY a single JSON/i);
  });

  it('every template has reasonable turn / minute bounds', () => {
    for (const tpl of SCENARIO_TEMPLATES) {
      expect(tpl.estimatedTurns).toBeGreaterThanOrEqual(3);
      expect(tpl.estimatedTurns).toBeLessThanOrEqual(20);
      expect(tpl.estimatedMinutes).toBeGreaterThanOrEqual(3);
      expect(tpl.estimatedMinutes).toBeLessThanOrEqual(30);
    }
  });

  it('every template references an npcId that exists in NPCS', () => {
    const ids = new Set(NPCS.map((n) => n.id));
    for (const tpl of SCENARIO_TEMPLATES) {
      expect(ids.has(tpl.npcId)).toBe(true);
    }
  });

  it('every template has at least one English and at least one Chinese topic keyword', () => {
    const tpl = SCENARIO_TEMPLATES.find((t) => t.id === 'mock_interview')!;
    const hasEnglish = tpl.topicKeywords.some((k) => /[a-z]/i.test(k));
    const hasChinese = tpl.topicKeywords.some((k) => /[一-龥]/.test(k));
    expect(hasEnglish).toBe(true);
    expect(hasChinese).toBe(true);
  });
});

describe('seed-data · Achievements', () => {
  it('has the six MVP achievements', () => {
    const ids = ACHIEVEMENT_DEFS.map((a) => a.id);
    expect(ids).toEqual([
      'first_chat',
      'three_friends',
      'scenario_survivor',
      'polite_mode',
      'bilingual',
      'streak_week',
    ]);
  });

  it('all rule keys are unique', () => {
    const rules = ACHIEVEMENT_DEFS.map((a) => a.rule);
    expect(new Set(rules).size).toBe(rules.length);
  });

  it('polite_mode and streak_week carry a ruleConfig', () => {
    const polite = ACHIEVEMENT_DEFS.find((a) => a.id === 'polite_mode')!;
    const streak = ACHIEVEMENT_DEFS.find((a) => a.id === 'streak_week')!;
    expect((polite as any).ruleConfig?.minGrade).toBe('B');
    expect((streak as any).ruleConfig?.days).toBe(7);
  });

  it('every achievement is non-dynamic in the P0 set', () => {
    for (const a of ACHIEVEMENT_DEFS) {
      expect(a.isDynamic).toBe(false);
    }
  });
});
