// Shared builder for the "Learning Update" block. Used by:
//   - scenario/end.ts to include in the scenario_end SSE payload (so users see the block
//     immediately after finishing, not only after re-opening Review).
//   - scenario/sessionView.ts to render the persisted summary.
// Both paths must produce identical output for a given (preSnapshot, postSnapshot) pair —
// hence a single source of truth here.

import type { LearningUpdateItem } from '@popcorn/shared';
import { getSkill } from './taxonomy';
import { STATUS_THRESHOLDS } from './aggregate';

export interface SkillSnapshot {
  level: number;
  evidenceN: number;
}

// Snapshot JSON on disk: {skillCode: {level, evidenceN}}. A legacy shape from earlier
// P5 rollout may still be {skillCode: level}. Handle both so old rows read cleanly.
export function parseSnapshot(raw: string | null | undefined): Record<string, SkillSnapshot> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, SkillSnapshot> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      // Legacy snapshots predate evidenceN but were only persisted after an evaluated
      // scenario. Treat their level as established instead of labelling every old row
      // "Not enough evidence" forever.
      out[k] = { level: v, evidenceN: STATUS_THRESHOLDS.gatheringMinEvidence };
      continue;
    }
    if (v && typeof v === 'object') {
      const rec = v as { level?: unknown; evidenceN?: unknown };
      const level = typeof rec.level === 'number' && Number.isFinite(rec.level) ? rec.level : null;
      const evidenceN = typeof rec.evidenceN === 'number' && Number.isFinite(rec.evidenceN)
        ? Math.max(0, Math.floor(rec.evidenceN))
        : 0;
      if (level !== null) out[k] = { level, evidenceN };
    }
  }
  return out;
}

// Match aggregate.ts's own bucket rules. evidenceN gates "gathering" so the summary
// never disagrees with the Journey learner-model view for the same skill.
export function bucketStatus(snapshot: SkillSnapshot): LearningUpdateItem['status'] {
  if (snapshot.evidenceN < STATUS_THRESHOLDS.gatheringMinEvidence) return 'gathering';
  if (snapshot.level < STATUS_THRESHOLDS.needsPractice) return 'needs_practice';
  if (snapshot.level < STATUS_THRESHOLDS.developing) return 'developing';
  if (snapshot.level < STATUS_THRESHOLDS.solid) return 'solid';
  return 'strong';
}

// Build the ordered LearningUpdateItem[] shown in the summary. Unknown skill codes are
// dropped so a taxonomy prune can't surface deleted skills; deterministic sort keeps
// output stable across renders.
export function buildLearningUpdate(
  pre: Record<string, SkillSnapshot>,
  post: Record<string, SkillSnapshot>,
): LearningUpdateItem[] {
  const codes = new Set([...Object.keys(pre), ...Object.keys(post)]);
  const items: LearningUpdateItem[] = [];
  for (const code of codes) {
    const skill = getSkill(code);
    if (!skill) continue;
    const beforeSnap = pre[code] ?? post[code] ?? { level: 0, evidenceN: 0 };
    const afterSnap = post[code] ?? beforeSnap;
    const before = Number(beforeSnap.level.toFixed(4));
    const after = Number(afterSnap.level.toFixed(4));
    items.push({
      skillCode: code,
      labelEn: skill.labelEn,
      labelZh: skill.labelZh,
      before,
      after,
      delta: Number((after - before).toFixed(4)),
      status: bucketStatus(afterSnap),
    });
  }
  items.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.skillCode.localeCompare(b.skillCode));
  return items;
}
