// Learning Focus + Recommended Practice UI. Consumed by the Journey dashboard.
// Deterministic pure rendering — no LLM, no derived logic here (all computed server-side).

import type {
  LearnerSkillState,
  LearnerSkillStatus,
  LearnerTrend,
  ScenarioRecommendation,
} from '@popcorn/shared';

// ---------- Copy helpers ----------

export const STATUS_LABEL: Record<LearnerSkillStatus, string> = {
  gathering: 'Not enough evidence',
  needs_practice: 'Needs practice',
  developing: 'Developing',
  solid: 'Solid',
  strong: 'Strong',
};

export function statusColor(status: LearnerSkillStatus): { bg: string; ink: string } {
  if (status === 'strong') return { bg: 'var(--moss-soft)', ink: 'var(--moss)' };
  if (status === 'solid') return { bg: 'var(--moss-soft)', ink: 'var(--moss)' };
  if (status === 'developing') return { bg: 'var(--plum-soft)', ink: 'var(--plum-ink)' };
  if (status === 'needs_practice') return { bg: 'var(--coral-soft)', ink: 'var(--coral-ink)' };
  return { bg: 'var(--surface-2)', ink: 'var(--muted)' };
}

export function trendGlyph(trend: LearnerTrend): string {
  if (trend === 'improving') return '↗';
  if (trend === 'declining') return '↘';
  return '→';
}

// ---------- Learning Focus ----------

export function LearningFocus({ focus, skills = [] }: { focus: LearnerSkillState[]; skills?: LearnerSkillState[] }) {
  if (focus.length === 0) {
    const hasReliableEvidence = skills.some((skill) => skill.evidenceN >= 3);
    return (
      <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        <p className="text-[13px]" style={{ color: 'var(--muted)' }}>
          {hasReliableEvidence
            ? 'No weak areas identified right now. Your evidenced skills are holding up well.'
            : 'Not enough evidence yet. Chat with an NPC or complete a scenario to see focus areas.'}
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {focus.map((skill) => (
        <SkillFocusCard key={skill.skillCode} skill={skill} />
      ))}
    </div>
  );
}

function SkillFocusCard({ skill }: { skill: LearnerSkillState }) {
  const color = statusColor(skill.status);
  const glyph = trendGlyph(skill.trend);
  return (
    <div className="rounded-xl p-4"
         style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium leading-tight">{skill.labelEn}</div>
          <div className="text-[10.5px] font-mono mt-0.5" style={{ color: 'var(--muted)' }}>
            {skill.labelZh} · {skill.category}
          </div>
        </div>
        <span aria-label={`trend ${skill.trend}`} className="text-[13px]"
              style={{ color: skill.trend === 'improving' ? 'var(--moss)'
                     : skill.trend === 'declining' ? 'var(--coral-ink)'
                     : 'var(--muted)' }}>
          {glyph}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-3">
        <span className="text-[10.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: color.bg, color: color.ink }}>
          {STATUS_LABEL[skill.status]}
        </span>
        <span className="text-[10.5px] font-mono" style={{ color: 'var(--muted)' }}>
          {skill.evidenceN} evidence
        </span>
      </div>
    </div>
  );
}

// ---------- Recommended Practice ----------

export interface RecommendationCardProps {
  recommendation: ScenarioRecommendation;
  onStart: (templateId: string, npcId: string) => void;
  onDismiss: (templateId: string) => void;
  busy?: 'start' | 'dismiss' | null;
}

export function RecommendationCard({ recommendation: r, onStart, onDismiss, busy = null }: RecommendationCardProps) {
  return (
    <div className="rounded-xl p-5"
         style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em]"
                  style={{ color: 'var(--plum-ink)' }}>
              {r.source === 'learner_model' ? 'targeted practice' : 'fresh scenario'}
            </span>
            <span className="text-[10.5px]" style={{ color: 'var(--muted)' }}>
              · with {r.npcId}
            </span>
          </div>
          <h3 className="font-serif text-[22px] leading-tight mt-1">{r.title}</h3>
          {r.titleZh && (
            <p className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--muted)' }}>{r.titleZh}</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <Pill>{r.difficulty}</Pill>
          <Pill>{r.estimatedMinutes} min</Pill>
        </div>
      </div>

      <p className="text-[13px] mt-3 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        {r.reason}
      </p>

      {r.targetSkills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.targetSkills.map((code) => (
            <span key={code} className="text-[10.5px] font-mono px-2 py-0.5 rounded"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink-2)', border: '1px solid var(--hairline)' }}>
              {code}
            </span>
          ))}
        </div>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <button type="button"
                onClick={() => onDismiss(r.templateId)}
                disabled={busy !== null}
                className="px-4 py-2 rounded-full text-[13px] transition hover:bg-[var(--bg-warm)] disabled:opacity-40"
                style={{ color: 'var(--ink-2)' }}>
          {busy === 'dismiss' ? 'Dismissing…' : 'Maybe later'}
        </button>
        <button type="button"
                onClick={() => onStart(r.templateId, r.npcId)}
                disabled={busy !== null}
                className="px-5 py-2.5 rounded-full text-[13px] font-medium transition disabled:opacity-40"
                style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-ink)' }}>
          {busy === 'start' ? 'Starting…' : 'Start now'}
        </button>
      </div>
    </div>
  );
}

export function RecommendationEmpty() {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
      <p className="text-[13px]" style={{ color: 'var(--muted)' }}>
        No recommendations right now. Try chatting a bit more so we know what to suggest.
      </p>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-mono uppercase tracking-wider px-2 py-1 rounded"
          style={{ background: 'var(--surface-2)', color: 'var(--ink-2)', border: '1px solid var(--hairline)' }}>
      {children}
    </span>
  );
}
