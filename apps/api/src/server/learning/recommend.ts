import type { PrismaClient, ScenarioTemplate, UserProfile } from '@prisma/client';
import { computeLearnerModel, type SkillState } from './aggregate';
import { isCefrLevel, type CefrLevel } from './taxonomy';
import { STAGE_VALUE } from '@/server/scenario/trigger';

// Dismiss cooldowns come from ActivityEvent; completion cooldowns come from visible,
// completed ScenarioSession rows so retract/hide behavior stays consistent.
export const DISMISS_COOLDOWN_DAYS = 3;
export const COMPLETION_COOLDOWN_DAYS = 7;

// Scoring weights (per spec — sum to 1.0 before repetition penalty).
export const WEIGHTS = { weakness: 0.55, evidence: 0.20, cefr: 0.15, profile: 0.10 } as const;

export type RecommendationSource = 'learner_model' | 'novelty';

export interface Recommendation {
  templateId: string;
  npcId: string;
  title: string;
  titleZh: string | null;
  reason: string;
  targetSkills: string[];
  difficulty: string;
  estimatedMinutes: number;
  source: RecommendationSource;
  score: number;
}

interface CandidateTemplate {
  template: ScenarioTemplate;
  targetSkills: string[];
  stageValueMin: number;
}

const CEFR_ORDER: Record<CefrLevel, number> = { A2: 1, B1: 2, B2: 3, C1: 4 };
const DAY_MS = 86_400_000;

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function activityTemplateId(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload) as { templateId?: unknown };
    return typeof parsed.templateId === 'string' ? parsed.templateId : null;
  } catch {
    return null;
  }
}

// ---------- Shared filter ----------

// Shared eligibility check. Both the recommender ranker and the /start endpoint call
// this so a scenario that /recommendation would suppress can never be launched via /start
// (stale UI, hand-crafted request, deep-link retry).
export interface EligibilityDeps {
  prisma: PrismaClient;
  userId: string;
  templateId: string;
}
export type IneligibleReason =
  | 'not_found'
  | 'disabled'
  | 'stage'
  | 'open_session'
  | 'dismiss_cooldown'
  | 'completion_cooldown'
  | 'cefr_too_hard';

export async function checkTemplateEligibility(deps: EligibilityDeps): Promise<
  | { ok: true; template: ScenarioTemplate }
  | { ok: false; reason: IneligibleReason }
> {
  const template = await deps.prisma.scenarioTemplate.findUnique({ where: { id: deps.templateId } });
  if (!template) return { ok: false, reason: 'not_found' };
  if (!template.enabled) return { ok: false, reason: 'disabled' };

  const now = Date.now();
  const [rel, open, dismissedEvents, completedSession, user] = await Promise.all([
    deps.prisma.relationship.findUnique({
      where: { userId_npcId: { userId: deps.userId, npcId: template.npcId } },
    }),
    deps.prisma.scenarioSession.findFirst({
      where: {
        userId: deps.userId,
        npcId: template.npcId,
        hiddenAt: null,
        status: { in: ['invited', 'accepted', 'active', 'paused'] },
      },
    }),
    deps.prisma.activityEvent.findMany({
      where: {
        userId: deps.userId,
        type: 'scenario_dismissed',
        createdAt: { gte: new Date(now - DISMISS_COOLDOWN_DAYS * DAY_MS) },
      },
      select: { payload: true },
      orderBy: { createdAt: 'desc' },
    }),
    deps.prisma.scenarioSession.findFirst({
      where: {
        userId: deps.userId,
        templateId: template.id,
        status: 'completed',
        hiddenAt: null,
        OR: [
          { endedAt: { gte: new Date(now - COMPLETION_COOLDOWN_DAYS * DAY_MS) } },
          { endedAt: null, invitedAt: { gte: new Date(now - COMPLETION_COOLDOWN_DAYS * DAY_MS) } },
        ],
      },
      select: { id: true },
    }),
    deps.prisma.user.findUnique({ where: { id: deps.userId }, select: { cefrLevel: true } }),
  ]);

  const stageValue = rel?.stageValue ?? 1;
  if (stageValue < (STAGE_VALUE[template.minStage] ?? 99)) return { ok: false, reason: 'stage' };

  if (open) return { ok: false, reason: 'open_session' };

  if (dismissedEvents.some((event) => activityTemplateId(event.payload) === template.id)) {
    return { ok: false, reason: 'dismiss_cooldown' };
  }
  if (completedSession) return { ok: false, reason: 'completion_cooldown' };

  if (cefrTooHard(template.difficulty, user?.cefrLevel ?? null)) return { ok: false, reason: 'cefr_too_hard' };

  return { ok: true, template };
}

// ---------- Scoring ----------

// Weakness driver: high when target skills are low & evidenced. Ignores gathering
// (no confident evidence yet) so we never recommend "because you're weak" without proof.
function weaknessScore(model: SkillState[], targetSkills: string[]): { score: number; drivers: SkillState[] } {
  if (targetSkills.length === 0) return { score: 0, drivers: [] };
  const targeted = model.filter((s) => targetSkills.includes(s.skillCode));
  const withEvidence = targeted.filter((s) => s.evidenceN >= 3);
  if (withEvidence.length === 0) return { score: 0, drivers: [] };
  // Higher when levels are low. Average across evidenced targets.
  const raw = withEvidence.reduce((sum, s) => sum + (1 - s.level), 0) / withEvidence.length;
  const drivers = withEvidence
    .filter((s) => s.status === 'needs_practice' || s.status === 'developing')
    .sort((a, b) => a.level - b.level || a.skillCode.localeCompare(b.skillCode));
  return { score: Math.min(1, raw), drivers };
}

function evidenceScore(model: SkillState[], targetSkills: string[]): number {
  if (targetSkills.length === 0) return 0;
  const targeted = model.filter((s) => targetSkills.includes(s.skillCode));
  if (targeted.length === 0) return 0;
  // Cap at 5 evidence per skill — beyond that, more data doesn't raise confidence.
  const avg = targeted.reduce((sum, s) => sum + Math.min(1, s.evidenceN / 5), 0) / targeted.length;
  return avg;
}

function cefrFitScore(templateDifficulty: string, userCefr: string | null): number {
  if (!isCefrLevel(templateDifficulty)) return 0.5;
  if (!isCefrLevel(userCefr)) return 0.5;
  const gap = Math.abs(CEFR_ORDER[userCefr] - CEFR_ORDER[templateDifficulty]);
  if (gap === 0) return 1;
  if (gap === 1) return 0.6;
  return 0.2;
}

function profileFitScore(template: ScenarioTemplate, profile: UserProfile | null): number {
  if (!profile) return 0.3;
  const goal = (profile.goal ?? '').toLowerCase();
  const interests = parseJsonArray(profile.interests).map((s) => s.toLowerCase());
  const keywords = parseJsonArray(template.topicKeywords).map((s) => s.toLowerCase());
  const registerTags = parseJsonArray(template.registerTags).map((s) => s.toLowerCase());
  const templateTerms = new Set([...keywords, ...registerTags, template.title.toLowerCase()]);
  const tokens = (value: string) => new Set(
    (value.match(/[a-z0-9]+/g) ?? []).map((token) => (
      token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token
    )),
  );
  const overlaps = (a: string, b: string) => {
    if (a === b) return true;
    const bTokens = tokens(b);
    for (const token of tokens(a)) {
      if (bTokens.has(token)) return true;
    }
    return false;
  };
  let hits = 0;
  for (const term of templateTerms) {
    if (goal && overlaps(goal, term)) hits++;
    for (const interest of interests) {
      if (overlaps(interest, term)) { hits++; break; }
    }
  }
  return Math.min(1, hits / 3);
}

// ---------- Filters ----------

function cefrTooHard(templateDifficulty: string, userCefr: string | null): boolean {
  if (!isCefrLevel(templateDifficulty) || !isCefrLevel(userCefr)) return false;
  return CEFR_ORDER[templateDifficulty] > CEFR_ORDER[userCefr] + 1;
}

// ---------- Reasoning ----------

function drivingSkillLabels(drivers: SkillState[]): string[] {
  return drivers.slice(0, 2).map((s) => s.labelEn);
}

function totalMistakes(drivers: SkillState[]): number {
  return drivers.reduce((sum, s) => sum + s.mistakeCount, 0);
}

function reasonFor(
  source: RecommendationSource,
  template: ScenarioTemplate,
  drivers: SkillState[],
  profile: UserProfile | null,
): string {
  if (source === 'learner_model' && drivers.length > 0) {
    const labels = drivingSkillLabels(drivers).join(' and ');
    const mistakes = totalMistakes(drivers);
    if (mistakes === 0) {
      return (
        `Recent evidence suggests ${labels} would benefit from more practice. ` +
        `This scenario gives targeted work on ${labels.toLowerCase()}.`
      );
    }
    return (
      `We noticed ${mistakes} recurring ${mistakes === 1 ? 'mistake' : 'mistakes'} involving ${labels} in your recent practice. ` +
      `This scenario gives targeted work on ${labels.toLowerCase()}.`
    );
  }
  // novelty phrasing — never fabricates weakness
  const goal = profile?.goal;
  if (goal) return `A fresh scenario aligned with your goal (${goal}). Try it while you have time.`;
  return `A new scenario you haven't tried yet — good practice while your relationship is warm.`;
}

// ---------- Main API ----------

export interface RecommendDeps {
  prisma: PrismaClient;
  userId: string;
  limit?: number; // MVP = 1
}

export async function recommendScenarios(deps: RecommendDeps): Promise<Recommendation[]> {
  const { prisma, userId, limit = 1 } = deps;

  const now = Date.now();
  const [templates, relationships, openSessions, dismissedEvents, completedSessions, user, profile, model] = await Promise.all([
    prisma.scenarioTemplate.findMany({ where: { enabled: true } }),
    prisma.relationship.findMany({ where: { userId } }),
    prisma.scenarioSession.findMany({
      where: { userId, status: { in: ['invited', 'accepted', 'active', 'paused'] }, hiddenAt: null },
      select: { templateId: true, npcId: true },
    }),
    prisma.activityEvent.findMany({
      where: {
        userId,
        type: 'scenario_dismissed',
        createdAt: { gte: new Date(now - DISMISS_COOLDOWN_DAYS * DAY_MS) },
      },
      select: { payload: true },
    }),
    prisma.scenarioSession.findMany({
      where: {
        userId,
        status: 'completed',
        hiddenAt: null,
        OR: [
          { endedAt: { gte: new Date(now - COMPLETION_COOLDOWN_DAYS * DAY_MS) } },
          { endedAt: null, invitedAt: { gte: new Date(now - COMPLETION_COOLDOWN_DAYS * DAY_MS) } },
        ],
      },
      select: { templateId: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { cefrLevel: true } }),
    prisma.userProfile.findUnique({ where: { userId } }),
    computeLearnerModel({ prisma, userId }),
  ]);

  const userCefr = user?.cefrLevel ?? null;
  const stageByNpc = new Map(relationships.map((r) => [r.npcId, r.stageValue] as const));
  const npcHasOpenSession = new Set(openSessions.map((s) => s.npcId));

  const dismissedRecent = new Set(
    dismissedEvents.map((event) => activityTemplateId(event.payload)).filter((id): id is string => Boolean(id)),
  );
  const completedRecent = new Set(completedSessions.map((session) => session.templateId));

  const candidates: CandidateTemplate[] = templates
    .map((t) => ({
      template: t,
      targetSkills: parseJsonArray(t.targetSkills),
      stageValueMin: STAGE_VALUE[t.minStage] ?? 99,
    }))
    // hard filters
    .filter((c) => (stageByNpc.get(c.template.npcId) ?? 1) >= c.stageValueMin)
    .filter((c) => !npcHasOpenSession.has(c.template.npcId))
    .filter((c) => !dismissedRecent.has(c.template.id))
    .filter((c) => !completedRecent.has(c.template.id))
    .filter((c) => !cefrTooHard(c.template.difficulty, userCefr));

  if (candidates.length === 0) return [];

  const scored = candidates.map((c) => {
    const { score: wScore, drivers } = weaknessScore(model.skills, c.targetSkills);
    const eScore = evidenceScore(model.skills, c.targetSkills);
    const cScore = cefrFitScore(c.template.difficulty, userCefr);
    const pScore = profileFitScore(c.template, profile);
    const composite =
      WEIGHTS.weakness * wScore +
      WEIGHTS.evidence * eScore +
      WEIGHTS.cefr * cScore +
      WEIGHTS.profile * pScore;
    const source: RecommendationSource = drivers.length > 0 ? 'learner_model' : 'novelty';
    return {
      candidate: c,
      score: Number(composite.toFixed(4)),
      source,
      drivers,
    };
  });

  // Deterministic tiebreak on templateId keeps output stable across calls with identical state.
  scored.sort((a, b) => (b.score - a.score) || a.candidate.template.id.localeCompare(b.candidate.template.id));

  return scored.slice(0, limit).map((entry) => ({
    templateId: entry.candidate.template.id,
    npcId: entry.candidate.template.npcId,
    title: entry.candidate.template.title,
    titleZh: entry.candidate.template.titleZh,
    reason: reasonFor(entry.source, entry.candidate.template, entry.drivers, profile),
    targetSkills: entry.candidate.targetSkills,
    difficulty: entry.candidate.template.difficulty,
    estimatedMinutes: entry.candidate.template.estimatedMinutes,
    source: entry.source,
    score: entry.score,
  }));
}

// ---------- Start / Dismiss ----------

export class RecommendationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'RecommendationError';
  }
}

export interface StartResult {
  sessionId: string;
  npcId: string;
  templateId: string;
}

// Server-side re-check + create an invited session so the frontend's existing
// invitation → accept flow picks it up. We deliberately do not call acceptScenario
// here: that requires an LLM opening turn, and going through the invited state
// lets the user cancel with one click if they change their mind.
//
// Runs the FULL recommender filter (not just stage/open/existence) so a stale UI
// or hand-crafted request cannot launch a scenario that /recommendation would suppress
// — e.g. a scenario in dismiss/completion cooldown, or above the user's CEFR by >1.
// The invited-session guard is re-checked inside a transaction to prevent two
// concurrent start requests from creating duplicate invitations for the same NPC.
export async function startScenarioFromTemplate(deps: {
  prisma: PrismaClient;
  userId: string;
  templateId: string;
}): Promise<StartResult> {
  const { prisma, userId, templateId } = deps;

  const check = await checkTemplateEligibility({ prisma, userId, templateId });
  if (!check.ok) {
    if (check.reason === 'not_found' || check.reason === 'disabled') {
      throw new RecommendationError('NOT_FOUND', 'Scenario template not available');
    }
    if (check.reason === 'stage') throw new RecommendationError('CONFLICT', 'Relationship stage not reached');
    if (check.reason === 'open_session') throw new RecommendationError('CONFLICT', 'Another scenario is already open with this NPC');
    if (check.reason === 'dismiss_cooldown') throw new RecommendationError('CONFLICT', 'This scenario was recently dismissed');
    if (check.reason === 'completion_cooldown') throw new RecommendationError('CONFLICT', 'This scenario was recently completed');
    if (check.reason === 'cefr_too_hard') throw new RecommendationError('CONFLICT', 'This scenario is above your current level');
    throw new RecommendationError('CONFLICT', 'This scenario cannot be started right now');
  }
  const template = check.template;

  const thread = await prisma.thread.upsert({
    where: { userId_npcId: { userId, npcId: template.npcId } },
    create: { userId, npcId: template.npcId },
    update: {},
  });

  // Concurrency guard for this course project's SQLite deployment: its serialized
  // writer makes the second transaction observe the first invitation. A Postgres
  // deployment would additionally need a partial unique index for open statuses.
  const session = await prisma.$transaction(async (tx) => {
    const race = await tx.scenarioSession.findFirst({
      where: {
        userId,
        npcId: template.npcId,
        hiddenAt: null,
        status: { in: ['invited', 'accepted', 'active', 'paused'] },
      },
    });
    if (race) throw new RecommendationError('CONFLICT', 'Another scenario is already open with this NPC');
    return tx.scenarioSession.create({
      data: {
        userId,
        npcId: template.npcId,
        threadId: thread.id,
        templateId: template.id,
        status: 'invited',
        triggerRationale: JSON.stringify({ source: 'learner_recommendation' }),
      },
    });
  });

  return { sessionId: session.id, npcId: template.npcId, templateId: template.id };
}

// Cooldown record. Idempotent — a second dismiss just extends the window.
export async function dismissRecommendation(deps: {
  prisma: PrismaClient;
  userId: string;
  templateId: string;
}): Promise<void> {
  const template = await deps.prisma.scenarioTemplate.findUnique({ where: { id: deps.templateId }, select: { id: true } });
  if (!template) throw new RecommendationError('NOT_FOUND', 'Scenario template not available');

  await deps.prisma.activityEvent.create({
    data: {
      userId: deps.userId,
      type: 'scenario_dismissed',
      payload: JSON.stringify({ templateId: deps.templateId }),
    },
  });
}
