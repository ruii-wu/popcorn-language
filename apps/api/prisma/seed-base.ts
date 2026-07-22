import type { PrismaClient } from '@prisma/client';
import { ACHIEVEMENTS, NPCS, SCENARIO_TEMPLATES } from './seed-data';

export async function seedBaseData(prisma: PrismaClient): Promise<void> {
  for (const npc of NPCS) {
    const data = {
      name: npc.name,
      avatarGlyph: npc.avatarGlyph,
      avatarBg: npc.avatarBg,
      avatarInk: npc.avatarInk,
      shortBio: npc.shortBio,
      personaPrompt: npc.personaPrompt,
      introMessage: npc.introMessage,
      languageProfile: JSON.stringify(npc.languageProfile),
      topicInterests: JSON.stringify(npc.topicInterests),
      scenarioRoles: JSON.stringify(npc.scenarioRoles),
    };
    await prisma.npc.upsert({
      where: { id: npc.id },
      update: data,
      create: { id: npc.id, ...data },
    });
  }

  for (const template of SCENARIO_TEMPLATES) {
    const data = {
      title: template.title,
      titleZh: template.titleZh ?? null,
      npcId: template.npcId,
      rolePlayedBy: template.rolePlayedBy,
      minStage: template.minStage,
      estimatedMinutes: template.estimatedMinutes,
      estimatedTurns: template.estimatedTurns,
      systemPrompt: template.systemPrompt,
      enabled: template.enabled,
      registerTags: JSON.stringify(template.registerTags),
      topicKeywords: JSON.stringify(template.topicKeywords),
    };
    await prisma.scenarioTemplate.upsert({
      where: { id: template.id },
      update: data,
      create: { id: template.id, ...data },
    });
  }

  for (const achievement of ACHIEVEMENTS) {
    const data = {
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon ?? null,
      rule: achievement.rule,
      ruleConfig: achievement.ruleConfig ? JSON.stringify(achievement.ruleConfig) : null,
      isDynamic: false,
      enabled: true,
    };
    await prisma.achievementDef.upsert({
      where: { id: achievement.id },
      update: data,
      create: { id: achievement.id, ...data },
    });
  }
}
