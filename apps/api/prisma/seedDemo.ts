// prisma/seedDemo.ts — additive, idempotent demo data (run AFTER `npm run db:seed`).
import type { PrismaClient } from '@prisma/client';

const DAY = 86_400_000;

export async function seedDemo(
  prisma: PrismaClient,
  opts: { username?: string } = {},
): Promise<{ userId: string }> {
  const username = opts.username ?? 'demo';

  // idempotent: drop any prior demo user; cascade clears all owned rows.
  await prisma.user.deleteMany({ where: { username } });

  const npcCount = await prisma.npc.count({ where: { id: { in: ['lily', 'chen', 'emma'] } } });
  const template = await prisma.scenarioTemplate.findUnique({ where: { id: 'mock_interview' } });
  if (npcCount < 3 || !template) {
    throw new Error('Base seed missing — run `npm run db:seed` before `db:seed:demo`.');
  }

  const now = Date.now();
  const user = await prisma.user.create({
    data: {
      username,
      password: username,
      displayName: 'Demo Learner',
      cefrLevel: 'B1',
      profile: { create: { role: 'Software engineer', goal: 'work', interests: JSON.stringify(['coffee', 'hiking', 'cats']) } },
      settings: { create: { memoryStrategy: 'hybrid', grammarCorrection: true } },
    },
  });

  const stages: { npcId: string; stage: string; stageValue: number; points: number }[] = [
    { npcId: 'lily', stage: 'close', stageValue: 3, points: 80 },
    { npcId: 'chen', stage: 'friend', stageValue: 2, points: 45 },
    { npcId: 'emma', stage: 'friend', stageValue: 2, points: 30 },
  ];
  let lilyThreadId = '';
  for (const { npcId, stage, stageValue, points } of stages) {
    const ageDays = npcId === 'lily' ? 21 : npcId === 'chen' ? 14 : 7;
    const rel = await prisma.relationship.create({
      data: {
        userId: user.id, npcId, stage, stageValue,
        relationshipPoints: points,
        conversationCount: stageValue * 4,
        scenarioCount: npcId === 'lily' ? 1 : 0,
        createdAt: new Date(now - ageDays * DAY),
        lastInteractionAt: new Date(now - DAY),
      },
    });
    if (stageValue >= 2) {
      await prisma.relationshipEvent.create({ data: { relationshipId: rel.id, fromStage: 'acquaintance', toStage: 'friend', reason: 'msg_count_threshold' } });
    }
    if (stageValue >= 3) {
      await prisma.relationshipEvent.create({ data: { relationshipId: rel.id, fromStage: 'friend', toStage: 'close', reason: 'scenario_completed:Mock Interview' } });
    }
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId, lastMsgAt: new Date(now - DAY) } });
    if (npcId === 'lily') lilyThreadId = thread.id;
    await prisma.message.create({ data: { threadId: thread.id, userId: user.id, role: 'user', text: 'Hi! Good to see you again.', createdAt: new Date(now - DAY - 3_600_000) } });
    await prisma.message.create({ data: { threadId: thread.id, userId: null, role: 'npc', text: 'Hey! Always good to chat with you.', createdAt: new Date(now - DAY) } });
  }

  // predicate, value, and which NPCs know it (per-NPC scoping)
  const facts: { predicate: string; value: string; npcs: string[] }[] = [
    { predicate: 'likes', value: 'oat milk lattes', npcs: ['lily'] },
    { predicate: 'lives_near', value: "Murray's Bagels", npcs: ['lily'] },
    { predicate: 'works_as', value: 'software engineer', npcs: ['chen'] },
    { predicate: 'goal', value: 'grow into a tech lead', npcs: ['chen'] },
    { predicate: 'has_pet', value: 'a cat named Mochi', npcs: ['emma', 'lily'] },
    { predicate: 'likes', value: 'indie music', npcs: ['emma'] },
  ];
  for (const f of facts) {
    await prisma.memoryFact.create({
      data: { userId: user.id, predicate: f.predicate, value: f.value, knownToNpcs: JSON.stringify(f.npcs) },
    });
  }
  await prisma.memory.create({
    data: { userId: user.id, title: 'Cat-loving hiker', body: 'You often bring up weekend hikes and your cat — a warm, outdoorsy vibe.', npcId: 'lily', sourceType: 'chat_pattern' },
  });
  await prisma.memory.create({
    data: { userId: user.id, title: 'Career-focused', body: 'You talk about projects and growing into a lead role.', npcId: 'chen', sourceType: 'chat_pattern' },
  });
  await prisma.memory.create({
    data: { userId: user.id, title: 'Cat parent', body: 'Mochi comes up a lot — clearly a cat person.', npcId: 'emma', sourceType: 'chat_pattern' },
  });

  // one completed, graded scenario with Lily (mock_interview)
  if (!lilyThreadId) throw new Error('Demo seed: lily thread missing (stages must include lily).');
  const session = await prisma.scenarioSession.create({
    data: {
      userId: user.id, npcId: 'lily', threadId: lilyThreadId, templateId: 'mock_interview',
      status: 'completed', state: JSON.stringify({ impression: 8, stress: 'Low', turnsLeft: 0 }),
      startedAt: new Date(now - DAY - 1_800_000), endedAt: new Date(now - DAY - 600_000),
    },
  });
  const preLevels = {
    'vocabulary.interview': { level: 0.5, evidenceN: 0 },
    'pragmatics.hedging': { level: 0.5, evidenceN: 0 },
    'pragmatics.formal_register': { level: 0.5, evidenceN: 0 },
    'interaction.describing_experience': { level: 0.5, evidenceN: 0 },
  };
  const postLevels = {
    ...preLevels,
    'pragmatics.hedging': { level: 0.5675, evidenceN: 1 },
  };
  await prisma.scenarioSummary.create({
    data: {
      sessionId: session.id, grade: 'A-',
      languageNote: 'Strong, polite phrasing; a couple of article slips.',
      pragmaticsNote: 'Good hedging and turn-taking under light pressure.',
      relationshipNote: 'Lily was impressed — your rapport moved to close friend.',
      preLevels: JSON.stringify(preLevels),
      postLevels: JSON.stringify(postLevels),
    },
  });
  await prisma.learningSignal.create({
    data: {
      userId: user.id,
      sourceType: 'scenario_summary',
      sourceRef: session.id,
      skillCode: 'pragmatics.hedging',
      polarity: 'success',
      score: 0.75,
      confidence: 0.9,
      weight: 1,
      evidence: 'I would say my strongest example is...',
      npcId: 'lily',
      scenarioSessionId: session.id,
      createdAt: new Date(now - DAY - 600_000),
    },
  });
  for (let i = 0; i < 3; i++) {
    await prisma.learningSignal.create({
      data: {
        userId: user.id,
        sourceType: 'conversation_review',
        sourceRef: `demo-clarification-${i + 1}`,
        skillCode: 'interaction.clarification',
        polarity: 'mistake',
        score: 0.2 + i * 0.05,
        confidence: 0.9,
        weight: 1,
        evidence: 'What this means?',
        npcId: 'emma',
        createdAt: new Date(now - (4 - i) * DAY),
      },
    });
  }
  await prisma.scenarioTurn.create({
    data: { sessionId: session.id, turnIndex: 0, stateBefore: JSON.stringify({ impression: 5, stress: 'Medium', turnsLeft: 6 }), stateAfter: JSON.stringify({ impression: 6, stress: 'Medium', turnsLeft: 5 }) },
  });

  for (const achievementId of ['first_chat', 'scenario_survivor', 'polite_mode']) {
    await prisma.userAchievement.create({ data: { userId: user.id, achievementId } });
  }

  for (let d = 0; d < 6; d++) {
    await prisma.activityEvent.create({ data: { userId: user.id, type: 'message_sent', createdAt: new Date(now - d * DAY) } });
  }
  await prisma.activityEvent.create({
    data: {
      userId: user.id,
      type: 'scenario_completed',
      payload: JSON.stringify({ sessionId: session.id, templateId: session.templateId, grade: 'A-' }),
      createdAt: new Date(now - DAY - 600_000),
    },
  });

  return { userId: user.id };
}
