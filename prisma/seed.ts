import { PrismaClient } from '@prisma/client';
import { NPCS, SCENARIO_TEMPLATES, ACHIEVEMENTS } from './seed-data';

const prisma = new PrismaClient();

async function main() {
  for (const n of NPCS) {
    await prisma.npc.upsert({
      where: { id: n.id },
      update: { scenarioRoles: JSON.stringify(n.scenarioRoles) },
      create: {
        id: n.id, name: n.name, avatarGlyph: n.avatarGlyph, avatarBg: n.avatarBg, avatarInk: n.avatarInk,
        shortBio: n.shortBio, personaPrompt: n.personaPrompt, introMessage: n.introMessage,
        languageProfile: JSON.stringify(n.languageProfile),
        topicInterests: JSON.stringify(n.topicInterests),
        scenarioRoles: JSON.stringify(n.scenarioRoles),
      },
    });
  }
  for (const s of SCENARIO_TEMPLATES) {
    await prisma.scenarioTemplate.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id, title: s.title, titleZh: s.titleZh, npcId: s.npcId, rolePlayedBy: s.rolePlayedBy,
        minStage: s.minStage, estimatedMinutes: s.estimatedMinutes, estimatedTurns: s.estimatedTurns,
        systemPrompt: s.systemPrompt, enabled: s.enabled,
        registerTags: JSON.stringify(s.registerTags),
        topicKeywords: JSON.stringify(s.topicKeywords),
      },
    });
  }
  for (const a of ACHIEVEMENTS) {
    await prisma.achievementDef.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id, title: a.title, description: a.description, icon: a.icon, rule: a.rule,
        ruleConfig: a.ruleConfig ? JSON.stringify(a.ruleConfig) : null,
      },
    });
  }
  console.log(`Seeded ${NPCS.length} NPCs, ${SCENARIO_TEMPLATES.length} scenario(s), ${ACHIEVEMENTS.length} achievements.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
