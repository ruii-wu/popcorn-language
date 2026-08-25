import type { PrismaClient, LearningSignal } from '@prisma/client';
import { SKILLS, initialLevelFromCefr, type SkillCategory } from './taxonomy';
import type { LearningSignalSource } from './signals';

// EMA learning rates per source. Reflect evidence quality: scenarios weigh more than
// per-turn corrections, and conversation-review is in between.
const SOURCE_ALPHA: Record<LearningSignalSource, number> = {
  correction: 0.15,
  conversation_review: 0.20,
  scenario_summary: 0.30,
};

export const STATUS_THRESHOLDS = {
  gatheringMinEvidence: 3,
  needsPractice: 0.40,
  developing: 0.65,
  solid: 0.80,
} as const;

// A trend needs enough recent signal to be meaningful; below this we say "flat".
export const TREND_MIN_EVIDENCE = 6;
export const TREND_DELTA_THRESHOLD = 0.08;

export type LearnerSkillStatus =
  | 'gathering'      // < 3 evidence, level is a bootstrap
  | 'needs_practice' // level < 0.40
  | 'developing'     // 0.40 <= level < 0.65
  | 'solid'          // 0.65 <= level < 0.80
  | 'strong';        // level >= 0.80

export type LearnerTrend = 'improving' | 'stable' | 'declining';

export interface SkillState {
  skillCode: string;
  category: SkillCategory;
  labelEn: string;
  labelZh: string;
  level: number;              // 0..1, EMA-derived
  evidenceN: number;          // valid signal count
  successCount: number;
  mistakeCount: number;
  status: LearnerSkillStatus;
  trend: LearnerTrend;
  lastObservedAt: Date | null;
}

export interface LearnerModel {
  skills: SkillState[];       // one per skill in the fixed taxonomy
  focus: SkillState[];        // top-3 that could use practice AND have evidence
}

function statusFor(level: number, evidenceN: number): LearnerSkillStatus {
  if (evidenceN < STATUS_THRESHOLDS.gatheringMinEvidence) return 'gathering';
  if (level < STATUS_THRESHOLDS.needsPractice) return 'needs_practice';
  if (level < STATUS_THRESHOLDS.developing) return 'developing';
  if (level < STATUS_THRESHOLDS.solid) return 'solid';
  return 'strong';
}

function trendFor(scoresChron: number[]): LearnerTrend {
  if (scoresChron.length < TREND_MIN_EVIDENCE) return 'stable';
  const recent = scoresChron.slice(-3);
  const prev = scoresChron.slice(-6, -3);
  if (recent.length < 3 || prev.length < 3) return 'stable';
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const delta = mean(recent) - mean(prev);
  if (delta > TREND_DELTA_THRESHOLD) return 'improving';
  if (delta < -TREND_DELTA_THRESHOLD) return 'declining';
  return 'stable';
}

interface SignalWithRelations extends LearningSignal {
  sourceMessage: { retractedAt: Date | null; hiddenAt: Date | null } | null;
  scenarioSession: { hiddenAt: Date | null; status: string } | null;
}

function isSignalValid(s: SignalWithRelations): boolean {
  // Zero-valued multipliers carry no evidence and must not increment evidenceN or
  // influence focus/recommendations if an old row bypassed current input validation.
  if (!Number.isFinite(s.weight) || s.weight <= 0) return false;
  if (!Number.isFinite(s.confidence) || s.confidence <= 0) return false;
  if (s.sourceMessage && (s.sourceMessage.retractedAt || s.sourceMessage.hiddenAt)) return false;
  if (s.scenarioSession) {
    if (s.scenarioSession.hiddenAt) return false;
    // Scenario evidence becomes authoritative only with the atomic completion claim.
    if (s.sourceType === 'scenario_summary' && s.scenarioSession.status !== 'completed') return false;
  }
  return true;
}

export interface AggregateDeps {
  prisma: Pick<PrismaClient, 'user' | 'learningSignal'>;
  userId: string;
}

// Read-time aggregation. Every call re-derives mastery from the signal table so
// retracts/hides invalidate their evidence automatically. Deterministic — no LLM.
export async function computeLearnerModel(deps: AggregateDeps): Promise<LearnerModel> {
  const { prisma, userId } = deps;

  const [user, rawSignals] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { cefrLevel: true } }),
    prisma.learningSignal.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        sourceMessage: { select: { retractedAt: true, hiddenAt: true } },
        scenarioSession: { select: { hiddenAt: true, status: true } },
      },
    }),
  ]);
  const userCefr = user?.cefrLevel ?? null;
  const signals = rawSignals.filter(isSignalValid);

  const bySkill = new Map<string, SignalWithRelations[]>();
  for (const s of signals) {
    const list = bySkill.get(s.skillCode);
    if (list) list.push(s);
    else bySkill.set(s.skillCode, [s]);
  }

  const skillStates: SkillState[] = SKILLS.map((skill) => {
    const initial = initialLevelFromCefr(userCefr, skill.cefrHint);
    const list = bySkill.get(skill.code) ?? [];
    let level = initial;
    let successCount = 0;
    let mistakeCount = 0;
    const chronScores: number[] = [];
    let lastObservedAt: Date | null = null;
    for (const s of list) {
      const source = s.sourceType as LearningSignalSource;
      const baseAlpha = SOURCE_ALPHA[source] ?? SOURCE_ALPHA.correction;
      const effAlpha = Math.max(0, Math.min(1, baseAlpha * s.confidence * s.weight));
      level = level * (1 - effAlpha) + s.score * effAlpha;
      if (s.polarity === 'success') successCount++;
      else mistakeCount++;
      chronScores.push(s.score);
      lastObservedAt = s.createdAt;
    }
    const evidenceN = list.length;
    return {
      skillCode: skill.code,
      category: skill.category,
      labelEn: skill.labelEn,
      labelZh: skill.labelZh,
      level,
      evidenceN,
      successCount,
      mistakeCount,
      status: statusFor(level, evidenceN),
      trend: trendFor(chronScores),
      lastObservedAt,
    };
  });

  // Focus: skills that would benefit from practice AND have enough evidence to trust the ranking.
  const focus = skillStates
    .filter((s) => s.evidenceN >= STATUS_THRESHOLDS.gatheringMinEvidence)
    .filter((s) => s.status === 'needs_practice' || s.status === 'developing')
    .sort((a, b) => a.level - b.level || a.skillCode.localeCompare(b.skillCode))
    .slice(0, 3);

  return { skills: skillStates, focus };
}
