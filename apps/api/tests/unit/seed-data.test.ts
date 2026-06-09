import { describe, it, expect } from 'vitest';
import { NPCS, SCENARIO_TEMPLATES, ACHIEVEMENTS } from '../../prisma/seed-data';

describe('seed-data', () => {
  it('has exactly 3 NPCs with unique ids and required fields', () => {
    expect(NPCS).toHaveLength(3);
    const ids = NPCS.map(n => n.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(expect.arrayContaining(['lily', 'chen', 'emma']));
    for (const n of NPCS) {
      expect(n.personaPrompt.length).toBeGreaterThan(10);
      expect(n.introMessage.length).toBeGreaterThan(0);
      expect(n.languageProfile.primary).toBeTruthy();
    }
  });

  it('has the mock_interview template referencing a real NPC', () => {
    const t = SCENARIO_TEMPLATES.find(s => s.id === 'mock_interview');
    expect(t).toBeDefined();
    expect(NPCS.map(n => n.id)).toContain(t!.npcId);
    expect(t!.systemPrompt.length).toBeGreaterThan(10);
  });

  it('has 6 achievements with unique ids', () => {
    expect(ACHIEVEMENTS).toHaveLength(6);
    expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(6);
  });
});
