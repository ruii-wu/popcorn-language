import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { seedBaseData } from '../prisma/seed-base';
import { computeLearnerModel, type SkillState } from '../src/server/learning/aggregate';
import { writeSignals } from '../src/server/learning/signals';
import { recommendScenarios, recommendationComponents, weightedRecommendationScore, WEIGHTS, type RecommendationWeights, type Recommendation } from '../src/server/learning/recommend';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = resolve(root, 'docs/reports/data');
const now = Date.parse('2026-08-30T12:00:00Z');
const old = new Date(now - 30 * 86400000);
const dimensions = ['weakness', 'evidence', 'cefr', 'profile'] as const;
const templates = ['mock_interview', 'flat_viewing'] as const;
const targets = ['pragmatics.hedging', 'interaction.clarification'] as const;
const patterns = [
  { id: 'cold', interview: [], flat: [] },
  { id: 'sparse-two', interview: [0.2, 0.2], flat: [0.2, 0.2] },
  { id: 'threshold-three', interview: [0.2, 0.2, 0.2], flat: [0.2, 0.2, 0.2] },
  { id: 'interview-weak', interview: [0, 0, 0, 0, 0], flat: [] },
  { id: 'flat-weak', interview: [], flat: [0, 0, 0, 0, 0] },
  { id: 'equal-low-scores', interview: [0.3, 0.3, 0.3, 0.3, 0.3], flat: [0.3, 0.3, 0.3, 0.3, 0.3] },
  { id: 'competing-evidence', interview: [0.1, 0.1, 0.1], flat: [0.45, 0.45, 0.45, 0.45, 0.45] },
  { id: 'interview-improving', interview: [0.1, 0.1, 0.1, 0.9, 0.9, 0.9], flat: [0.4, 0.4, 0.4] },
  { id: 'flat-improving', interview: [0.4, 0.4, 0.4], flat: [0.1, 0.1, 0.1, 0.9, 0.9, 0.9] },
  { id: 'low-score-success', interview: [0.3, 0.3, 0.3], flat: [0.3, 0.3, 0.3] },
];
const normalize = (weights: RecommendationWeights): RecommendationWeights => {
  const sum = dimensions.reduce((total, key) => total + weights[key], 0);
  assert(sum > 0);
  return Object.fromEntries(dimensions.map((key) => [key, weights[key] / sum])) as RecommendationWeights;
};
const variants = [
  { id: 'default', weights: WEIGHTS },
  { id: 'equal', weights: { weakness: 0.25, evidence: 0.25, cefr: 0.25, profile: 0.25 } },
  { id: 'weakness-only', weights: { weakness: 1, evidence: 0, cefr: 0, profile: 0 } },
  ...dimensions.map((key) => ({ id: `without-${key}`, weights: normalize({ ...WEIGHTS, [key]: 0 }) })),
];
const perturbations = new Map<string, RecommendationWeights>();
for (const w of [0.8, 1, 1.2]) for (const e of [0.8, 1, 1.2]) {
  for (const c of [0.8, 1, 1.2]) for (const p of [0.8, 1, 1.2]) {
    const weights = normalize({ weakness: WEIGHTS.weakness * w, evidence: WEIGHTS.evidence * e,
      cefr: WEIGHTS.cefr * c, profile: WEIGHTS.profile * p });
    const key = dimensions.map((dimension) => weights[dimension].toFixed(10)).join(',');
    perturbations.set(key, weights);
  }
}
// Exclude the unchanged baseline, including equivalent uniform scalings.
perturbations.delete(dimensions.map((key) => WEIGHTS[key].toFixed(10)).join(','));
type Ranked = { templateId: string; score: number }[];
interface RecommendationCase {
  id: string; archetype: string; cefr: string; direction: string;
  inputScores: { interview: number[]; flat: number[] }; skillStates: SkillState[];
  features: (ReturnType<typeof recommendationComponents> & { templateId: string })[];
  eligibleCount: number; production: Recommendation[]; margin: number;
  ablations: { config: string; ranking: Ranked }[]; perturbationFlips: number;
  perturbations: { key: string; ranking: Ranked }[];
}

async function main() {
  assert.equal(process.env.SCORING_EVAL_ISOLATED, '1', 'Use the root npm command, which creates temporary SQLite');
  assert(process.env.DATABASE_URL?.includes('popcorn-scoring-'), 'Refusing to use a non-evaluation database');
  const prisma = new PrismaClient();
  const realNow = Date.now;
  Date.now = () => now;
  try {
    await seedBaseData(prisma);
    const catalogue = await prisma.scenarioTemplate.findMany({ orderBy: { id: 'asc' } });
    assert.deepEqual(catalogue.map((template) => template.id), [...templates].sort());
    const cases: RecommendationCase[] = [];
    for (const pattern of patterns) for (const cefr of ['A2', 'B1', 'B2']) for (const direction of ['work', 'housing']) {
      const id = `${pattern.id}-${cefr}-${direction}`;
      const user = await prisma.user.create({ data: { id, username: `eval-${id}`, password: 'synthetic-only', cefrLevel: cefr } });
      const profile = await prisma.userProfile.create({ data: { userId: user.id,
        goal: direction === 'work' ? 'Prepare for a job interview' : 'Find a flat to rent',
        interests: JSON.stringify(direction === 'work' ? ['hiring', 'work'] : ['housing', 'flatmates']),
      } });
      for (const npcId of ['lily', 'emma']) {
        await prisma.relationship.create({ data: { userId: user.id, npcId, stage: 'friend', stageValue: 2 } });
      }
      for (let t = 0; t < templates.length; t++) {
        const template = catalogue.find((candidate) => candidate.id === templates[t])!;
        const thread = await prisma.thread.create({ data: { userId: user.id, npcId: template.npcId } });
        const scores = t === 0 ? pattern.interview : pattern.flat;
        for (let i = 0; i < scores.length; i++) {
          const session = await prisma.scenarioSession.create({ data: {
            userId: user.id, npcId: template.npcId, threadId: thread.id, templateId: template.id,
            status: 'completed', invitedAt: old, startedAt: old, endedAt: old,
          } });
          const evidence = t === 0 ? 'Synthetic rated response: I would suggest another approach.'
            : 'Synthetic rated response: Could you clarify the deposit amount?';
          await prisma.message.create({ data: { threadId: thread.id, userId: user.id,
            scenarioSessionId: session.id, role: 'user', text: evidence, createdAt: old } });
          await prisma.scenarioSummary.create({ data: { sessionId: session.id, grade: 'B',
            languageNote: 'Synthetic fixture, not an independently assessed learner.',
            pragmaticsNote: evidence, relationshipNote: 'Not evaluated.' } });
          const count = await writeSignals({ prisma, userId: user.id, sourceType: 'scenario_summary',
            sourceRef: session.id, scenarioSessionId: session.id, npcId: template.npcId, throwOnError: true,
            signals: [{ skillCode: targets[t], score: scores[i], confidence: 0.9, weight: 1,
              polarity: pattern.id === 'low-score-success' || scores[i] >= 0.65 ? 'success' : 'mistake', evidence }] });
          assert.equal(count, 1);
          await prisma.learningSignal.updateMany({ where: { sourceRef: session.id }, data: { createdAt: new Date(old.getTime() + i * 1000) } });
        }
      }
      const model = await computeLearnerModel({ prisma, userId: user.id });
      const eligible = await recommendScenarios({ prisma, userId: user.id, limit: 2 });
      assert.equal(eligible.length, 2, 'Scoring cases must have two eligible candidates');
      const features = catalogue.map((template) => ({ templateId: template.id,
        ...recommendationComponents(model.skills, template, JSON.parse(template.targetSkills), cefr, profile) }));
      const rank = (weights: RecommendationWeights) => features.map((feature) => ({ templateId: feature.templateId,
        score: weightedRecommendationScore(feature.components, weights) }))
        .sort((a, b) => b.score - a.score || a.templateId.localeCompare(b.templateId));
      const expected = rank(WEIGHTS);
      assert.deepEqual(expected, eligible.map(({ templateId, score }) => ({ templateId, score })), 'Evaluator/production rank mismatch');
      if (pattern.id === 'cold' || pattern.id === 'sparse-two') {
        assert(features.every((feature) => feature.components.weakness === 0));
        assert(eligible.every((item) => item.source === 'novelty'));
      }
      if (pattern.id === 'low-score-success') assert(eligible.every((item) => !item.reason.includes('recurring')));
      const perturbed = [...perturbations.entries()].map(([key, weights]) => ({ key, ranking: rank(weights) }));
      cases.push({ id, archetype: pattern.id, cefr, direction, inputScores: { interview: pattern.interview, flat: pattern.flat },
        skillStates: model.skills.filter((skill) => skill.evidenceN > 0), features, eligibleCount: eligible.length,
        production: eligible, margin: Number((expected[0].score - expected[1].score).toFixed(4)),
        ablations: variants.map((variant) => ({ config: variant.id, ranking: rank(variant.weights) })),
        perturbationFlips: perturbed.filter((item) => item.ranking[0].templateId !== expected[0].templateId).length,
        perturbations: perturbed });
    }

    // Eligibility-only probes are reported separately; weights cannot choose
    // between scenarios when fewer than two candidates survive the filters.
    const userId = 'cold-B1-work';
    const boundaryChecks: string[] = [];
    const expectCandidates = async (name: string, expected: string[]) => {
      const actual = await recommendScenarios({ prisma, userId, limit: 2 });
      assert.deepEqual(actual.map((item) => item.templateId).sort(), expected.sort(), name);
      boundaryChecks.push(name);
    };
    await prisma.relationship.update({ where: { userId_npcId: { userId, npcId: 'emma' } }, data: { stageValue: 1 } });
    await expectCandidates('relationship removes flat viewing (one candidate)', ['mock_interview']);
    await prisma.relationship.update({ where: { userId_npcId: { userId, npcId: 'emma' } }, data: { stageValue: 2 } });
    await prisma.activityEvent.create({ data: { userId, type: 'scenario_dismissed', payload: JSON.stringify({ templateId: 'mock_interview' }), createdAt: new Date(now) } });
    await expectCandidates('dismiss cooldown (one candidate)', ['flat_viewing']);
    const thread = await prisma.thread.findUniqueOrThrow({ where: { userId_npcId: { userId, npcId: 'emma' } } });
    const open = await prisma.scenarioSession.create({ data: { userId, npcId: 'emma', threadId: thread.id,
      templateId: 'flat_viewing', status: 'active', invitedAt: new Date(now) } });
    await expectCandidates('open session plus dismissal (zero candidates)', []);
    await prisma.scenarioSession.update({ where: { id: open.id }, data: { status: 'completed', endedAt: new Date(now) } });
    await expectCandidates('completion cooldown plus dismissal (zero candidates)', []);
    await prisma.scenarioSession.update({ where: { id: open.id }, data: { hiddenAt: new Date(now) } });
    await expectCandidates('hidden completion no longer suppresses flat viewing', ['flat_viewing']);
    await prisma.activityEvent.deleteMany({ where: { userId } });
    await prisma.user.update({ where: { id: userId }, data: { cefrLevel: 'A2' } });
    await prisma.scenarioTemplate.update({ where: { id: 'mock_interview' }, data: { difficulty: 'C1' } });
    await expectCandidates('CEFR excludes too-hard candidate (temporary template)', ['flat_viewing']);
    await prisma.scenarioTemplate.update({ where: { id: 'mock_interview' }, data: { difficulty: 'B1' } });

    const correction = await prisma.message.create({ data: { userId, threadId: thread.id, role: 'user', text: 'Synthetic correction evidence', createdAt: old } });
    await writeSignals({ prisma, userId, sourceType: 'correction', sourceRef: correction.id, sourceMessageId: correction.id,
      signals: [{ skillCode: 'grammar.past_tense', polarity: 'mistake', score: 0.1, confidence: 1, weight: 1 }], throwOnError: true });
    const evidenceCount = async () => (await computeLearnerModel({ prisma, userId })).skills.find((skill) => skill.skillCode === 'grammar.past_tense')!.evidenceN;
    assert.equal(await evidenceCount(), 1);
    await prisma.message.update({ where: { id: correction.id }, data: { retractedAt: new Date(now) } });
    assert.equal(await evidenceCount(), 0);
    boundaryChecks.push('retracted correction excluded from aggregation');
    await prisma.message.update({ where: { id: correction.id }, data: { retractedAt: null, hiddenAt: new Date(now) } });
    assert.equal(await evidenceCount(), 0);
    boundaryChecks.push('cascade-hidden correction excluded from aggregation');
    const signal = await prisma.learningSignal.findFirstOrThrow({ where: { userId: 'interview-weak-B1-work' } });
    await prisma.scenarioSession.update({ where: { id: signal.scenarioSessionId! }, data: { hiddenAt: new Date(now) } });
    const hiddenModel = await computeLearnerModel({ prisma, userId: signal.userId });
    assert.equal(hiddenModel.skills.find((skill) => skill.skillCode === targets[0])!.evidenceN, 4);
    boundaryChecks.push('hidden scenario evidence excluded from aggregation');

    const ablations = variants.map((variant) => ({ ...variant,
      changedTop1: cases.filter((item) => item.ablations.find((entry) => entry.config === variant.id)!.ranking[0].templateId !== item.production[0].templateId).length,
      ties: cases.filter((item) => { const rank = item.ablations.find((entry) => entry.config === variant.id)!.ranking; return rank[0].score === rank[1].score; }).length,
    }));
    const report = { method: 'Synthetic scoring sensitivity, not recommendation relevance or learning efficacy.',
      caseDesign: '10 archetypes x 3 CEFR levels x 2 profile directions; both catalogue scenarios eligible. Fixed clock, old completed sessions with linked transcript, summary and signals.',
      evidenceSource: 'Ranking fixtures use synthetic scenario_summary evidence; correction invalidation is a separate boundary probe. No LLM or human annotator.',
      caseCount: cases.length, productionParityCases: cases.length, catalogue: catalogue.map(({ id, difficulty, targetSkills }) => ({ id, difficulty, targetSkills })),
      defaultWeights: WEIGHTS, ablations, boundaryChecks,
      perturbationCount: perturbations.size, perturbationWeights: Object.fromEntries(perturbations),
      casesWithAnyFlip: cases.filter((item) => item.perturbationFlips > 0).length,
      flippedComparisons: cases.reduce((sum, item) => sum + item.perturbationFlips, 0),
      comparisonCount: cases.length * perturbations.size, cases };
    await mkdir(outDir, { recursive: true });
    await writeFile(resolve(outDir, 'recommendation-sensitivity.json'), JSON.stringify(report, null, 2));
    const table = ablations.map((item) => `| ${item.id} | ${item.changedTop1}/60 | ${item.ties}/60 |`).join('\n');
    await writeFile(resolve(outDir, 'recommendation-sensitivity.md'), `# Recommendation Scoring Sensitivity\n\n${report.method}\n\n${report.caseDesign}\n\n${report.evidenceSource}\n\n` +
      `| Configuration | Top-1 differs from default | Tied scores |\n|---|---:|---:|\n${table}\n\n` +
      `Each component weight is multiplied by 0.8, 1.0 or 1.2, then renormalized. After deduplicating equivalent weights and excluding the baseline: ${report.perturbationCount} configurations. ${report.casesWithAnyFlip}/60 cases flip at least once; ${report.flippedComparisons}/${report.comparisonCount} case-configuration comparisons flip. These correlated cases are not independent learner observations.\n\n` +
      `All 60 default rankings and rounded scores match the production recommender. ${boundaryChecks.length} separate eligibility/invalidation probes passed.\n\n` +
      `E is capped evidence count, not independent confidence; W ignores skills below three observations. Rank changes show component influence, not which recommendation is pedagogically better. The two-scenario catalogue cannot support a broad quality claim or optimal-weight claim.\n\n` +
      `Run: \`npm run eval:recommendation:sensitivity\`; optional \`-- --test\` also runs API tests on temporary SQLite. The wrapper deploys migrations, seeds base data and deletes its temporary database. No Ollama is required. Per-case inputs, components, scores and perturbation outcomes are in the companion JSON.\n`);
    console.log(JSON.stringify({ ablations, boundaryChecks, casesWithAnyFlip: report.casesWithAnyFlip,
      flippedComparisons: report.flippedComparisons, comparisonCount: report.comparisonCount }, null, 2));
  } finally {
    Date.now = realNow;
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
