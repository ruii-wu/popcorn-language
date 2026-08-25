import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { isSkillCode } from './taxonomy';

// Zod shape the LLM must return per-item. skillCode is validated separately against
// the fixed taxonomy so a Zod .enum(...) doesn't need to be kept in sync manually.
export const LearningSignalCandidateSchema = z.object({
  skillCode: z.string().min(1),
  polarity: z.enum(['success', 'mistake']),
  score: z.number().min(0).max(1),
  confidence: z.number().positive().max(1),
  weight: z.number().positive().max(2),
  evidence: z.string().trim().min(1).max(240).optional(),
});
export type LearningSignalCandidate = z.infer<typeof LearningSignalCandidateSchema>;

export type LearningSignalSource = 'correction' | 'scenario_summary' | 'conversation_review';

export interface WriteSignalsDeps {
  prisma: Pick<PrismaClient, 'learningSignal'>;
  userId: string;
  sourceType: LearningSignalSource;
  sourceRef: string;                                    // unique per source: msgId / sessionId / reviewId
  signals: unknown;
  npcId?: string | null;
  sourceMessageId?: string | null;
  scenarioSessionId?: string | null;
  // When set, only skill codes in this allow-list are accepted (used by scenarios so the
  // summary LLM cannot rate skills outside the template's declared targets).
  allowedSkills?: readonly string[];
  // Scenario completion uses strict mode inside its transaction. Hot-path
  // correction writes remain best-effort by default.
  throwOnError?: boolean;
}

// Filter raw LLM output against the taxonomy + optional allow-list. Unknown codes are
// silently dropped rather than throwing — LLM output is not trusted, and the caller
// shouldn't have to check every field.
export function normalizeSignals(
  raw: unknown,
  allowedSkills?: readonly string[],
): LearningSignalCandidate[] {
  if (!Array.isArray(raw)) return [];
  const allowSet = allowedSkills ? new Set(allowedSkills) : null;
  const out: LearningSignalCandidate[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const parsed = LearningSignalCandidateSchema.safeParse(item);
    if (!parsed.success) continue;
    if (!isSkillCode(parsed.data.skillCode)) continue;
    if (allowSet && !allowSet.has(parsed.data.skillCode)) continue;
    if (seen.has(parsed.data.skillCode)) continue;         // one signal per skill per source
    seen.add(parsed.data.skillCode);
    out.push(parsed.data);
  }
  return out;
}

// Idempotent write. Once its owning operation commits, a LearningSignal is an
// immutable event: the unique source key makes later retries no-op. Scenario end
// may replace orphan rows from a failed pre-atomic implementation, but does so
// inside the successful completion transaction before the evidence is authoritative.
// By default failures are logged for best-effort hot paths; completion opts into
// throwOnError so its transaction can roll back as a unit.
export async function writeSignals(deps: WriteSignalsDeps): Promise<number> {
  const filtered = normalizeSignals(deps.signals, deps.allowedSkills).filter((signal) => (
    deps.sourceType !== 'scenario_summary'
    || signal.polarity !== 'success'
    || Boolean(signal.evidence)
  ));
  if (filtered.length === 0) return 0;

  let stored = 0;
  for (const signal of filtered) {
    try {
      await deps.prisma.learningSignal.create({
        data: {
          userId: deps.userId,
          sourceType: deps.sourceType,
          sourceRef: deps.sourceRef,
          skillCode: signal.skillCode,
          polarity: signal.polarity,
          score: signal.score,
          confidence: signal.confidence,
          weight: signal.weight,
          evidence: signal.evidence ?? null,
          npcId: deps.npcId ?? null,
          sourceMessageId: deps.sourceMessageId ?? null,
          scenarioSessionId: deps.scenarioSessionId ?? null,
        },
      });
      stored++;
    } catch (e) {
      // Prisma error code P2002 = unique constraint violation. That is expected on
      // retries (the first attempt already wrote this signal) and is not an error.
      const code = (e as { code?: string } | null)?.code;
      if (code === 'P2002') continue;
      if (deps.throwOnError) throw e;
      console.error('[learning] writeSignals failed for', signal.skillCode, e);
    }
  }
  return stored;
}
