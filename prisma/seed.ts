import { PrismaClient } from '@prisma/client';
import { ACHIEVEMENT_DEFS, NPCS, SCENARIO_TEMPLATES } from './seed-data';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding NPCs…');
  for (const npc of NPCS) {
    const fields = {
      name: npc.name,
      avatarGlyph: npc.avatarGlyph,
      avatarBg: npc.avatarBg,
      avatarInk: npc.avatarInk,
      shortBio: npc.shortBio,
      personaPrompt: npc.personaPrompt,
      languageProfile: JSON.stringify(npc.languageProfile),
      topicInterests: JSON.stringify(npc.topicInterests),
      scenarioRoles: JSON.stringify(npc.scenarioRoles),
      introMessage: npc.introMessage,
    };
    await prisma.npc.upsert({
      where: { id: npc.id },
      update: fields,
      create: { id: npc.id, ...fields },
    });
  }

  console.log('Seeding scenario templates…');
  for (const tpl of SCENARIO_TEMPLATES) {
    const fields = {
      title: tpl.title,
      titleZh: tpl.titleZh,
      npcId: tpl.npcId,
      rolePlayedBy: tpl.rolePlayedBy,
      minStage: tpl.minStage,
      estimatedMinutes: tpl.estimatedMinutes,
      estimatedTurns: tpl.estimatedTurns,
      registerTags: JSON.stringify(tpl.registerTags),
      topicKeywords: JSON.stringify(tpl.topicKeywords),
      systemPrompt: tpl.systemPrompt,
      enabled: tpl.enabled,
    };
    await prisma.scenarioTemplate.upsert({
      where: { id: tpl.id },
      update: fields,
      create: { id: tpl.id, ...fields },
    });
  }

  console.log('Seeding achievements…');
  for (const ach of ACHIEVEMENT_DEFS) {
    const fields = {
      title: ach.title,
      description: ach.description,
      icon: ach.icon,
      rule: ach.rule,
      ruleConfig: 'ruleConfig' in ach && ach.ruleConfig ? JSON.stringify(ach.ruleConfig) : null,
      isDynamic: ach.isDynamic,
    };
    await prisma.achievementDef.upsert({
      where: { id: ach.id },
      update: fields,
      create: { id: ach.id, ...fields },
    });
  }

  console.log(`✓ Seeded ${NPCS.length} NPCs, ${SCENARIO_TEMPLATES.length} scenario(s), ${ACHIEVEMENT_DEFS.length} achievements.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
