// prisma/seedDemo.ts — additive, idempotent demo data (run AFTER `npm run db:seed`).
import type { PrismaClient } from '@prisma/client';

const DAY = 86_400_000;
const HOUR = 3_600_000;

type DemoNpcId = 'lily' | 'chen' | 'emma';
type DemoChatMessage = { role: 'user' | 'npc'; text: string; createdAt: Date };

export async function seedDemo(
  prisma: PrismaClient,
  opts: { username?: string; now?: Date } = {},
): Promise<{ userId: string }> {
  const username = opts.username ?? 'demo';

  // idempotent: drop any prior demo user; cascade clears all owned rows.
  await prisma.user.deleteMany({ where: { username } });

  const npcCount = await prisma.npc.count({ where: { id: { in: ['lily', 'chen', 'emma'] } } });
  const template = await prisma.scenarioTemplate.findUnique({ where: { id: 'mock_interview' } });
  if (npcCount < 3 || !template) {
    throw new Error('Base seed missing — run `npm run db:seed` before `db:seed:demo`.');
  }

  const nowDate = opts.now ?? new Date();
  const now = nowDate.getTime();
  if (!Number.isFinite(now)) throw new Error('Demo seed received an invalid time anchor.');
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

  const ago = (days: number, hours = 0) => new Date(now - days * DAY - hours * HOUR);
  const chatHistory: Record<DemoNpcId, DemoChatMessage[]> = {
    lily: [
      { role: 'user', text: 'I finally tried the oat milk latte you recommended.', createdAt: ago(6, 5) },
      { role: 'npc', text: 'And? Be honest — did it earn a permanent spot in your coffee order?', createdAt: ago(6, 4.8) },
      { role: 'user', text: 'Mochi woke me up at five again, so I definitely needed it.', createdAt: ago(3, 6) },
      { role: 'npc', text: 'Mochi has excellent timing. Extra coffee for you, extra treats for the tiny alarm clock.', createdAt: ago(3, 5.8) },
      { role: 'user', text: 'I am planning a short hike this weekend if the weather stays clear.', createdAt: ago(1, 5) },
      { role: 'npc', text: 'That sounds perfect. Prospect Park is easy, but I can suggest a longer trail if you want.', createdAt: ago(1, 4.8) },
      { role: 'user', text: 'I finished the code review. Now I need something cold and not too sweet.', createdAt: ago(0, 2) },
      { role: 'npc', text: 'You earned it. Try an iced oat cortado — strong, smooth, and only a little sweet.', createdAt: ago(0, 1.8) },
    ],
    chen: [
      { role: 'user', text: 'I want to grow into a tech lead, but I am not sure where to start.', createdAt: ago(5, 7) },
      { role: 'npc', text: 'Start by owning a small decision end to end, then explain the trade-offs clearly to the team.', createdAt: ago(5, 6.8) },
      { role: 'user', text: 'Yesterday I lead the planning meeting and wrote the follow-up.', createdAt: ago(3, 8) },
      { role: 'npc', text: 'That is useful practice. What decision did the group leave with?', createdAt: ago(3, 7.8) },
      { role: 'user', text: 'The deadline feels risky, but I disagree with the current estimate.', createdAt: ago(2, 5) },
      { role: 'npc', text: 'Frame the concern around evidence: acknowledge the estimate, name the risk, then propose an alternative.', createdAt: ago(2, 4.8) },
      { role: 'user', text: 'Could you review how I explained that trade-off to the team?', createdAt: ago(0, 5) },
      { role: 'npc', text: 'Yes. Your reasoning is clear; next, make the recommendation explicit in the first sentence.', createdAt: ago(0, 4.8) },
    ],
    emma: [
      { role: 'user', text: 'I found a new indie band while I was working late.', createdAt: ago(4, 6) },
      { role: 'npc', text: 'Send me the name! I need something new for my study playlist.', createdAt: ago(4, 5.8) },
      { role: 'user', text: 'I saw a flat listing, but the description of the bills was confusing.', createdAt: ago(2, 7) },
      { role: 'npc', text: 'Ask exactly what is included — heating, internet, council tax, and any shared costs.', createdAt: ago(2, 6.8) },
      { role: 'user', text: 'Could you clarify whether the deposit includes the first month of rent?', createdAt: ago(1, 7) },
      { role: 'npc', text: 'Good question. Usually they are separate, so I would ask the landlord to confirm both amounts.', createdAt: ago(1, 6.8) },
      { role: 'user', text: 'Mochi would judge every room mainly by the windows.', createdAt: ago(0, 7) },
      { role: 'npc', text: 'Honestly, that is a sensible viewing strategy. Good light for you, premium bird-watching for Mochi.', createdAt: ago(0, 6.8) },
    ],
  };

  const stages: { npcId: DemoNpcId; stage: string; stageValue: number; points: number }[] = [
    { npcId: 'lily', stage: 'close', stageValue: 3, points: 80 },
    { npcId: 'chen', stage: 'friend', stageValue: 2, points: 45 },
    { npcId: 'emma', stage: 'friend', stageValue: 2, points: 30 },
  ];
  let lilyThreadId = '';
  for (const { npcId, stage, stageValue, points } of stages) {
    const ageDays = npcId === 'lily' ? 21 : npcId === 'chen' ? 14 : 7;
    const messages = chatHistory[npcId];
    const latestMessageAt = messages[messages.length - 1].createdAt;
    const rel = await prisma.relationship.create({
      data: {
        userId: user.id, npcId, stage, stageValue,
        relationshipPoints: points,
        conversationCount: messages.filter((message) => message.role === 'user').length,
        scenarioCount: npcId === 'lily' ? 1 : 0,
        createdAt: new Date(now - ageDays * DAY),
        lastInteractionAt: latestMessageAt,
      },
    });
    if (stageValue >= 2) {
      await prisma.relationshipEvent.create({ data: { relationshipId: rel.id, fromStage: 'acquaintance', toStage: 'friend', reason: 'msg_count_threshold' } });
    }
    if (stageValue >= 3) {
      await prisma.relationshipEvent.create({ data: { relationshipId: rel.id, fromStage: 'friend', toStage: 'close', reason: 'scenario_completed:Mock Interview' } });
    }
    const thread = await prisma.thread.create({ data: { userId: user.id, npcId, lastMsgAt: latestMessageAt } });
    if (npcId === 'lily') lilyThreadId = thread.id;
    await prisma.message.createMany({
      data: messages.map((message) => ({
        threadId: thread.id,
        userId: message.role === 'user' ? user.id : null,
        role: message.role,
        text: message.text,
        createdAt: message.createdAt,
      })),
    });
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
  const learningEvidence = [
    {
      skillCode: 'grammar.past_tense',
      sourceType: 'correction',
      npcId: 'chen',
      scores: [0.10, 0.12, 0.16, 0.22, 0.28, 0.34],
      evidence: 'Yesterday I lead the planning meeting.',
    },
    {
      skillCode: 'pragmatics.polite_disagreement',
      sourceType: 'conversation_review',
      npcId: 'chen',
      scores: [0.30, 0.33, 0.37, 0.39],
      evidence: 'No, that estimate will not work.',
    },
    {
      skillCode: 'interaction.clarification',
      sourceType: 'conversation_review',
      npcId: 'emma',
      scores: [0.22, 0.27, 0.31, 0.43, 0.55, 0.64],
      evidence: 'What this means?',
    },
  ] as const;
  for (const skill of learningEvidence) {
    for (let i = 0; i < skill.scores.length; i++) {
      await prisma.learningSignal.create({
        data: {
          userId: user.id,
          sourceType: skill.sourceType,
          sourceRef: `demo-${skill.skillCode}-${i + 1}`,
          skillCode: skill.skillCode,
          polarity: 'mistake',
          score: skill.scores[i],
          confidence: 0.9,
          weight: 1,
          evidence: skill.evidence,
          npcId: skill.npcId,
          createdAt: new Date(now - (skill.scores.length - i) * DAY),
        },
      });
    }
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
