import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { seedBaseData } from '../../prisma/seed-base';
import { ACHIEVEMENTS, NPCS, SCENARIO_TEMPLATES } from '../../prisma/seed-data';

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('base seed refresh', () => {
  it('restores every managed field when seed is run again', async () => {
    await prisma.npc.update({
      where: { id: 'lily' },
      data: { name: 'Old Lily', personaPrompt: 'old', introMessage: 'old', topicInterests: '[]' },
    });
    await prisma.scenarioTemplate.update({
      where: { id: 'mock_interview' },
      data: { title: 'Old title', systemPrompt: 'old', topicKeywords: '[]', enabled: false },
    });
    await prisma.achievementDef.update({
      where: { id: 'first_chat' },
      data: { title: 'Old achievement', description: 'old', rule: 'old', enabled: false },
    });

    await seedBaseData(prisma);

    const expectedNpc = NPCS.find((npc) => npc.id === 'lily')!;
    const npc = await prisma.npc.findUniqueOrThrow({ where: { id: expectedNpc.id } });
    expect(npc).toMatchObject({
      name: expectedNpc.name,
      avatarGlyph: expectedNpc.avatarGlyph,
      avatarBg: expectedNpc.avatarBg,
      avatarInk: expectedNpc.avatarInk,
      shortBio: expectedNpc.shortBio,
      personaPrompt: expectedNpc.personaPrompt,
      introMessage: expectedNpc.introMessage,
      languageProfile: JSON.stringify(expectedNpc.languageProfile),
      topicInterests: JSON.stringify(expectedNpc.topicInterests),
      scenarioRoles: JSON.stringify(expectedNpc.scenarioRoles),
    });

    const expectedTemplate = SCENARIO_TEMPLATES.find((template) => template.id === 'mock_interview')!;
    const template = await prisma.scenarioTemplate.findUniqueOrThrow({ where: { id: expectedTemplate.id } });
    expect(template).toMatchObject({
      title: expectedTemplate.title,
      titleZh: expectedTemplate.titleZh,
      npcId: expectedTemplate.npcId,
      rolePlayedBy: expectedTemplate.rolePlayedBy,
      minStage: expectedTemplate.minStage,
      estimatedMinutes: expectedTemplate.estimatedMinutes,
      estimatedTurns: expectedTemplate.estimatedTurns,
      registerTags: JSON.stringify(expectedTemplate.registerTags),
      systemPrompt: expectedTemplate.systemPrompt,
      topicKeywords: JSON.stringify(expectedTemplate.topicKeywords),
      enabled: expectedTemplate.enabled,
    });

    const expectedAchievement = ACHIEVEMENTS.find((achievement) => achievement.id === 'first_chat')!;
    const achievement = await prisma.achievementDef.findUniqueOrThrow({ where: { id: expectedAchievement.id } });
    expect(achievement).toMatchObject({
      title: expectedAchievement.title,
      description: expectedAchievement.description,
      icon: expectedAchievement.icon ?? null,
      rule: expectedAchievement.rule,
      ruleConfig: null,
      isDynamic: false,
      enabled: true,
    });
  });
});
